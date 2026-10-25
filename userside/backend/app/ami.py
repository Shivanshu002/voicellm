"""Minimal Asterisk Manager Interface client: one connection per originated call."""
import socket
import uuid

from . import config

# OriginateResponse "Reason" codes (Asterisk AST_CONTROL_*)
_REASONS = {0: "failed", 1: "failed", 3: "no_answer", 4: "answered", 5: "busy", 8: "failed"}


class AMIError(Exception):
    pass


class _Conn:
    def __init__(self, timeout):
        self.sock = socket.create_connection((config.AMI_HOST, config.AMI_PORT), timeout=10)
        self.sock.settimeout(timeout)
        self.file = self.sock.makefile("rb")
        self.file.readline()  # "Asterisk Call Manager/x.y"

    def send(self, fields: list[tuple[str, str]]):
        msg = "".join(f"{k}: {v}\r\n" for k, v in fields) + "\r\n"
        self.sock.sendall(msg.encode())

    def read_block(self) -> dict:
        block = {}
        while True:
            line = self.file.readline()
            if not line:
                raise AMIError("Asterisk closed the connection")
            line = line.decode(errors="replace").rstrip("\r\n")
            if not line:
                if block:
                    return block
                continue
            key, _, value = line.partition(":")
            block[key.strip()] = value.strip()

    def close(self):
        try:
            self.send([("Action", "Logoff")])
        except OSError:
            pass
        self.sock.close()


def originate(phone: str, variables: dict, caller_id: str) -> tuple[str, str]:
    """Dial `phone` and, once answered, run the agent. Blocks until Asterisk knows the
    outcome. Returns (status, detail): status is answered | no_answer | busy | failed."""
    if not config.AMI_SECRET:
        raise AMIError("AMI_SECRET is not set in backend/.env")
    conn = None
    try:
        conn = _Conn(timeout=config.RING_TIMEOUT_SECONDS + 30)
        conn.send([("Action", "Login"), ("Username", config.AMI_USER), ("Secret", config.AMI_SECRET),
                   ("Events", "call")])
        if conn.read_block().get("Response") != "Success":
            raise AMIError("AMI login failed (check AMI_USER / AMI_SECRET)")

        action_id = uuid.uuid4().hex
        fields = [
            ("Action", "Originate"),
            # the Local channel's ;2 half dials the number (voicellm-dialout), and once it
            # is answered the ;1 half runs the agent (outbound-ai)
            ("Channel", f"Local/{phone}@voicellm-dialout"),
            ("Context", "outbound-ai"),
            ("Exten", "s"),
            ("Priority", "1"),
            ("CallerID", caller_id),
            ("Timeout", str(config.RING_TIMEOUT_SECONDS * 1000)),
            ("Async", "true"),
            ("ActionID", action_id),
        ]
        # "__" = inherited by both halves of the Local channel
        fields += [("Variable", f"__{k}={v}") for k, v in variables.items()]
        conn.send(fields)

        while True:
            block = conn.read_block()
            if block.get("ActionID") != action_id:
                continue
            if block.get("Response") == "Error":
                raise AMIError(block.get("Message", "Originate rejected"))
            if block.get("Event") == "OriginateResponse":
                reason = int(block.get("Reason", "0") or 0)
                if block.get("Response") == "Success":
                    return "answered", ""
                return _REASONS.get(reason, "failed"), f"reason {reason}"
    except socket.timeout:
        return "failed", "timed out waiting for Asterisk"
    except OSError as exc:
        raise AMIError(f"cannot reach Asterisk AMI at {config.AMI_HOST}:{config.AMI_PORT}: {exc}")
    finally:
        if conn:
            conn.close()

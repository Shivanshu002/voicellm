"""Minimal Asterisk AGI client (replaces pyst2)."""
import re
import signal
import sys

_RESULT = re.compile(r"^200 result=(-?\d+)(?:\s+\((.*?)\))?")


class Hangup(Exception):
    pass


class AGI:
    def __init__(self, stdin=sys.stdin, stdout=sys.stdout):
        self._in = stdin
        self._out = stdout
        self.env = {}
        # Asterisk sends SIGHUP when the caller hangs up
        if hasattr(signal, "SIGHUP"):  # not on Windows (tests)
            signal.signal(signal.SIGHUP, self._on_sighup)
        while True:
            line = self._in.readline().strip()
            if not line:
                break
            key, _, value = line.partition(":")
            self.env[key.strip()] = value.strip()

    def _on_sighup(self, *_):
        raise Hangup()

    def execute(self, command):
        self._out.write(command + "\n")
        self._out.flush()
        line = self._in.readline()
        while line.strip() == "HANGUP":  # sent when AGISIGHUP=no
            line = self._in.readline()
        line = line.strip()
        if not line or line.startswith("511"):
            raise Hangup()
        match = _RESULT.match(line)
        if not match:
            raise RuntimeError(f"AGI error for {command!r}: {line}")
        result = int(match.group(1))
        if result == -1:
            raise Hangup()
        return result, match.group(2) or ""

    def answer(self):
        return self.execute("ANSWER")

    def verbose(self, message, level=1):
        message = message.replace('"', "'").replace("\n", " ")
        return self.execute(f'VERBOSE "{message}" {level}')

    def get_variable(self, name):
        """Channel variable value, or "" when it is not set."""
        result, data = self.execute(f"GET VARIABLE {name}")
        return data if result == 1 else ""

    def stream_file(self, path_without_ext, escape_digits=""):
        return self.execute(f'STREAM FILE {path_without_ext} "{escape_digits}"')

    def record_file(self, path_without_ext, fmt="wav", escape_digits="#",
                    max_ms=15000, silence_s=2):
        return self.execute(
            f'RECORD FILE {path_without_ext} {fmt} "{escape_digits}" {max_ms} 0 s={silence_s}'
        )

    def hangup(self):
        try:
            return self.execute("HANGUP")
        except Hangup:
            return 1, ""

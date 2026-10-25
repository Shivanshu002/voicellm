"""Settings from backend/.env (KEY=VALUE lines) or the environment.

Secrets that are not set are generated once and kept in backend/data/.
"""
import os
import secrets
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)


def _load_env_file():
    env = BASE_DIR / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


_load_env_file()


def _persistent_secret(name):
    """Value from the environment, else from data/<name>, else a new random one saved there."""
    if os.environ.get(name.upper()):
        return os.environ[name.upper()]
    path = DATA_DIR / name
    if not path.exists():
        path.write_text(secrets.token_urlsafe(32), encoding="utf-8")
    return path.read_text(encoding="utf-8").strip()


DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{(DATA_DIR / 'app.db').as_posix()}")
JWT_SECRET = _persistent_secret("jwt_secret")
JWT_DAYS = int(os.environ.get("JWT_DAYS", "7"))
# shared with the Asterisk AGI agent (deploy_wsl.sh copies data/internal_token into WSL)
INTERNAL_TOKEN = _persistent_secret("internal_token")

CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173").split(",")

# Asterisk Manager Interface (WSL Asterisk, reached through mirrored networking)
AMI_HOST = os.environ.get("AMI_HOST", "127.0.0.1")
AMI_PORT = int(os.environ.get("AMI_PORT", "5038"))
AMI_USER = os.environ.get("AMI_USER", "voicellm")
AMI_SECRET = os.environ.get("AMI_SECRET", "")

# "softphone": every call rings the local test phone (MicroSIP, extension 1001)
# "trunk":     calls go out to the real number through the SIP trunk
# "robot":     automated test: a robot in Asterisk answers (project/scripts/test_call_wsl.sh)
DIAL_MODE = os.environ.get("DIAL_MODE", "softphone")
# calls this machine can handle at once, over all companies (a laptop CPU: 1)
MAX_GLOBAL_CALLS = int(os.environ.get("MAX_GLOBAL_CALLS", "1"))
RING_TIMEOUT_SECONDS = int(os.environ.get("RING_TIMEOUT_SECONDS", "30"))
DIALER_ENABLED = os.environ.get("DIALER_ENABLED", "1") == "1"

# the dialer only places calls while the agent's LLM is loaded in RAM
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2:3b")

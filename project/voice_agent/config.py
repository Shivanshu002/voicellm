"""Paths and settings. Every value can be overridden with an environment variable."""
import os
import sys

IS_WINDOWS = sys.platform == "win32"

if IS_WINDOWS:
    # repository root: <root>\project\voice_agent\config.py
    _ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    _DEFAULT_WHISPER_BIN = os.path.join(_ROOT, "tools", "whisper", "Release", "whisper-cli.exe")
    _DEFAULT_PIPER_BIN = os.path.join(_ROOT, "tools", "piper", "piper", "piper.exe")
    _MODELS = os.path.join(_ROOT, "models")
    _DEFAULT_WORK_DIR = os.path.join(_ROOT, "tmp")
else:
    # Inside WSL / Linux: setup_wsl.sh copies everything to /opt/voicellm
    _ROOT = "/opt/voicellm"
    _DEFAULT_WHISPER_BIN = os.path.join(_ROOT, "whisper", "whisper-cli")
    _DEFAULT_PIPER_BIN = os.path.join(_ROOT, "piper", "piper")
    _MODELS = os.path.join(_ROOT, "models")
    _DEFAULT_WORK_DIR = "/var/spool/asterisk/voicellm"


def _env(name, default):
    return os.environ.get(name, default)


# "en" = English (base.en + amy voice), "hi" = Hindi (base multilingual + pratham voice)
LANGUAGE = _env("VA_LANGUAGE", "en")

WHISPER_BIN = _env("VA_WHISPER_BIN", _DEFAULT_WHISPER_BIN)
WHISPER_MODEL = _env(
    "VA_WHISPER_MODEL",
    os.path.join(_MODELS, "whisper", "ggml-base.en.bin" if LANGUAGE == "en" else "ggml-small.bin"),  # base writes Hindi in Urdu script
)
WHISPER_THREADS = int(_env("VA_WHISPER_THREADS", "4"))

PIPER_BIN = _env("VA_PIPER_BIN", _DEFAULT_PIPER_BIN)
PIPER_MODEL = _env(
    "VA_PIPER_MODEL",
    os.path.join(
        _MODELS, "piper",
        "en_US-amy-medium.onnx" if LANGUAGE == "en" else "hi_IN-pratham-medium.onnx",
    ),
)

# Ollama runs natively on Windows; WSL reaches it through localhost (mirrored networking)
OLLAMA_URL = _env("VA_OLLAMA_URL", "http://127.0.0.1:11434")
OLLAMA_MODEL = _env("VA_OLLAMA_MODEL", "llama3.2:3b")
OLLAMA_TIMEOUT = float(_env("VA_OLLAMA_TIMEOUT", "60"))

WORK_DIR = _env("VA_WORK_DIR", _DEFAULT_WORK_DIR)

# userside backend (Windows, reached from WSL through mirrored networking): gives the
# agent each outbound call's greeting/prompt and receives the transcript
BACKEND_URL = _env("VA_BACKEND_URL", "http://127.0.0.1:8000")
_TOKEN_FILE = _env("VA_INTERNAL_TOKEN_FILE", os.path.join(os.path.dirname(os.path.dirname(__file__)),
                                                          "internal_token"))


def internal_token():
    try:
        with open(_TOKEN_FILE, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""

MAX_TURNS = int(_env("VA_MAX_TURNS", "8"))
RECORD_MAX_SECONDS = int(_env("VA_RECORD_MAX_SECONDS", "15"))
RECORD_SILENCE_SECONDS = int(_env("VA_RECORD_SILENCE_SECONDS", "2"))
# how many silent recordings (each ~RECORD_SILENCE_SECONDS) before "sorry, please repeat"
WAIT_FOR_SPEECH_ATTEMPTS = int(_env("VA_WAIT_FOR_SPEECH_ATTEMPTS", "3"))

def _business_info():
    """Facts the agent may use, from business_info.txt next to the voice_agent package."""
    path = _env("VA_BUSINESS_INFO", os.path.join(os.path.dirname(os.path.dirname(__file__)), "business_info.txt"))
    try:
        with open(path, encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


BUSINESS_INFO = _business_info()

SYSTEM_PROMPT = _env(
    "VA_SYSTEM_PROMPT",
    "You are a polite customer support voice agent on a phone call. "
    "Reply in one or two short spoken sentences, under 30 words, "
    "and keep the first sentence very short. "
    "No lists, no markdown, no emojis. If you do not know something, "
    "say you will connect the caller to a human agent."
    + (" Always reply in simple Hindi." if LANGUAGE == "hi" else "")
    + (
        "\n\nAnswer only from these business facts; do not invent anything else:\n" + BUSINESS_INFO
        if BUSINESS_INFO else ""
    ),
)

GREETING = _env(
    "VA_GREETING",
    "Hello, thank you for calling support. How can I help you today?"
    if LANGUAGE == "en"
    else "नमस्ते, सपोर्ट पर कॉल करने के लिए धन्यवाद। मैं आपकी क्या मदद कर सकता हूँ?",
)
GOODBYE = _env(
    "VA_GOODBYE",
    "Thank you for calling. Goodbye." if LANGUAGE == "en" else "कॉल करने के लिए धन्यवाद। नमस्ते।",
)

"""Speech-to-text (whisper.cpp), LLM (Ollama) and text-to-speech (Piper).

Nothing here writes to stdout: the AGI script uses stdout to talk to Asterisk.
"""
import array
import json
import os
import queue
import re
import shutil
import subprocess
import sys
import threading
import wave

import requests

from . import config

_QUIET = {"stdout": subprocess.PIPE, "stderr": subprocess.PIPE}
# whisper prints these for silence/noise instead of an empty string
_NON_SPEECH = re.compile(r"^\s*[\[(].*?[\])]\s*$")


def _run(cmd, **kwargs):
    result = subprocess.run(cmd, **_QUIET, **kwargs)
    if result.returncode != 0:
        err = result.stderr.decode("utf-8", "replace") if isinstance(result.stderr, bytes) else result.stderr
        raise RuntimeError(f"{os.path.basename(cmd[0])} failed ({result.returncode}): {err[-500:]}")
    return result


def resample(src, dst, rate):
    """Convert a wav to mono 16-bit at `rate` Hz using sox."""
    if not shutil.which("sox"):
        raise RuntimeError("sox is not installed")
    _run(["sox", src, "-b", "16", "-c", "1", dst, "rate", str(rate)])
    return dst


def _duration(wav_path):
    try:
        with wave.open(wav_path, "rb") as w:
            return w.getnframes() / float(w.getframerate())
    except (wave.Error, OSError, EOFError, ZeroDivisionError):
        return 0.0


def has_speech(wav_path, min_peak=1000):
    """Cheap check before running whisper: does the 16-bit wav get louder than
    min_peak (~-30 dBFS)? Silent/muted callers come back near 0."""
    try:
        with wave.open(wav_path, "rb") as w:
            if w.getsampwidth() != 2 or w.getnframes() == 0:
                return False
            samples = array.array("h", w.readframes(w.getnframes()))
    except (wave.Error, OSError, EOFError):
        return False
    if sys.byteorder == "big":
        samples.byteswap()
    return max(abs(min(samples)), max(samples)) >= min_peak


def _audio_ctx(seconds):
    """Whisper always encodes 30 s (ctx 1500, 50 per second). Shrinking it to the clip
    length roughly halves STT time on CPU for short phone turns."""
    return min(1500, max(384, int(seconds * 50) + 64))


def speech_to_text(wav_path):
    """Transcribe a wav file. Returns "" when nothing was said."""
    seconds = _duration(wav_path)
    if seconds < 0.5:  # silent caller: Asterisk leaves an (almost) empty file
        return ""
    if shutil.which("sox"):
        # Asterisk records 8 kHz; whisper wants 16 kHz
        wav16 = wav_path[:-4] + "_16k.wav"
        resample(wav_path, wav16, 16000)
        wav_path = wav16
    result = _run(
        [
            config.WHISPER_BIN,
            "-m", config.WHISPER_MODEL,
            "-f", wav_path,
            "-l", config.LANGUAGE,
            "-t", str(config.WHISPER_THREADS),
            "-ac", str(_audio_ctx(seconds)),
            "-mc", "0",  # no text context: stops whisper repeating the sentence
            "-nt",  # no timestamps: plain text on stdout
            "-np",  # no progress/system info on stdout
        ]
    )
    text = result.stdout.decode("utf-8", "replace")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not _NON_SPEECH.match(ln)]
    return " ".join(lines).strip()


def ask_llm(messages):
    """messages: list of {"role": ..., "content": ...} without the system prompt."""
    resp = requests.post(
        f"{config.OLLAMA_URL}/api/chat",
        json={
            "model": config.OLLAMA_MODEL,
            "messages": [{"role": "system", "content": config.SYSTEM_PROMPT}] + messages,
            "stream": False,
            "keep_alive": -1,  # never unload: reloading from the HDD takes over a minute
            "options": {"num_predict": 90, "temperature": 0.4},
        },
        timeout=config.OLLAMA_TIMEOUT,
    )
    resp.raise_for_status()
    reply = resp.json().get("message", {}).get("content", "").strip()
    # TTS reads symbols out loud, strip markdown leftovers
    return re.sub(r"[*_#`>|]", "", reply)


# sentence end: . ! ? or Hindi danda, followed by space
_SENTENCE_END = re.compile(r"(?<=[.!?।])\s+")


def stream_llm_sentences(messages, system_prompt=None):
    """Like ask_llm, but yields the reply sentence by sentence as Ollama generates it.
    system_prompt overrides config.SYSTEM_PROMPT (outbound campaign calls)."""
    with requests.post(
        f"{config.OLLAMA_URL}/api/chat",
        json={
            "model": config.OLLAMA_MODEL,
            "messages": [{"role": "system", "content": system_prompt or config.SYSTEM_PROMPT}] + messages,
            "stream": True,
            "keep_alive": -1,
            "options": {"num_predict": 90, "temperature": 0.4},
        },
        stream=True,
        timeout=config.OLLAMA_TIMEOUT,
    ) as resp:
        resp.raise_for_status()
        buf, spoke = "", False
        for line in resp.iter_lines():
            if not line:
                continue
            chunk = json.loads(line)
            buf += chunk.get("message", {}).get("content", "")
            parts = _SENTENCE_END.split(buf)
            if len(parts) == 1 and not spoke and len(buf) > 40 and ", " in buf[30:]:
                # long first sentence: speak up to the first comma so the caller hears something sooner
                cut = buf.index(", ", 30) + 1
                parts = [buf[:cut], buf[cut:].lstrip()]
            # everything but the last part is a finished sentence
            for sentence in parts[:-1]:
                sentence = re.sub(r"[*_#`>|]", "", sentence).strip()
                if sentence:
                    spoke = True
                    yield sentence
            buf = parts[-1]
            if chunk.get("done"):
                break
        tail = re.sub(r"[*_#`>|]", "", buf).strip()
        if tail:
            yield tail


class Piper:
    """One long-running Piper process: the voice model loads once per call, not per sentence."""

    def __init__(self, out_dir):
        os.makedirs(out_dir, exist_ok=True)
        self._lock = threading.Lock()
        self._proc = subprocess.Popen(
            [config.PIPER_BIN, "-q", "--model", config.PIPER_MODEL,
             "--json-input", "--output_dir", out_dir],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
            text=True, encoding="utf-8", bufsize=1,
        )

    def synth(self, text, out_wav, telephone=True):
        raw = out_wav[:-4] + "_raw.wav" if telephone else out_wav
        with self._lock:
            # one JSON object per line; Piper prints the output path when the file is written
            self._proc.stdin.write(json.dumps({"text": " ".join(text.split()), "output_file": raw}) + "\n")
            self._proc.stdin.flush()
            if not self._proc.stdout.readline():
                raise RuntimeError("piper exited")
        if telephone:
            resample(raw, out_wav, 8000)
            os.remove(raw)
        return out_wav

    def close(self):
        try:
            self._proc.stdin.close()
            self._proc.wait(timeout=5)
        except Exception:
            self._proc.kill()


def reply_in_background(messages, piper, prefix, telephone=True, system_prompt=None):
    """Start LLM + TTS in a thread. Returns a queue that yields (sentence, wav_path) as
    each sentence is ready, then None. Exceptions are put on the queue too."""
    q = queue.Queue()

    def work():
        try:
            for i, sentence in enumerate(stream_llm_sentences(messages, system_prompt)):
                q.put((sentence, piper.synth(sentence, f"{prefix}_{i}.wav", telephone)))
        except Exception as exc:  # handed to the caller's thread
            q.put(exc)
        finally:
            q.put(None)

    threading.Thread(target=work, daemon=True).start()
    return q


def warm_up_llm():
    """Load the model into RAM and pre-process the system prompt, so the first caller
    waits neither for the disk nor for ~250 prompt tokens (Ollama reuses the prefix)."""
    requests.post(
        f"{config.OLLAMA_URL}/api/chat",
        json={
            "model": config.OLLAMA_MODEL,
            "messages": [{"role": "system", "content": config.SYSTEM_PROMPT},
                         {"role": "user", "content": "Hello"}],
            "stream": False,
            "keep_alive": -1,
            "options": {"num_predict": 1},
        },
        timeout=300,
    ).raise_for_status()


def text_to_speech(text, out_wav, telephone=True):
    """Synthesize `text` to `out_wav`. With telephone=True the file is 8 kHz mono for Asterisk.

    Returns the path of the playable wav.
    """
    raw = out_wav[:-4] + "_raw.wav" if telephone else out_wav
    # text goes through stdin, never through a shell
    _run(
        [config.PIPER_BIN, "--model", config.PIPER_MODEL, "--output_file", raw],
        input=text.encode("utf-8"),
    )
    if telephone:
        resample(raw, out_wav, 8000)
        os.remove(raw)
    return out_wav

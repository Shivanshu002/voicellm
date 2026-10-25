#!/opt/voicellm/venv/bin/python
"""Asterisk AGI entry point: one process per call.

Dialplan:  same => n,AGI(voice_agent.py)
"""
import hashlib
import json
import logging
import os
import re
import shutil
import sys
import time

sys.path.insert(0, "/opt/voicellm/app")

from voice_agent import backend, config, pipeline  # noqa: E402
from voice_agent.agi import AGI, Hangup  # noqa: E402

os.makedirs(config.WORK_DIR, exist_ok=True)
logging.basicConfig(
    filename=os.path.join(config.WORK_DIR, "voice_agent.log"),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s [%(process)d] %(message)s",
)
log = logging.getLogger("voice_agent")

CACHE_DIR = os.path.join(config.WORK_DIR, "cache")
# the agent's own reply ended the conversation: hang up without the stock goodbye
_SAID_GOODBYE = re.compile(r"\b(good ?bye|bye|have a (nice|good|great) day)\b|अलविदा|नमस्ते।?$", re.IGNORECASE)


def cached_prompt(name, text):
    """Fixed phrases (greeting, goodbye) are synthesized once and reused."""
    os.makedirs(CACHE_DIR, exist_ok=True)
    wav = os.path.join(CACHE_DIR, f"{name}_{config.LANGUAGE}.wav")
    if not os.path.exists(wav):
        # two calls may create it at once: write privately, then rename atomically
        tmp = f"{wav[:-4]}_{os.getpid()}.wav"
        pipeline.text_to_speech(text, tmp)
        os.replace(tmp, wav)
    return wav[:-4]


def main():
    agi = AGI()
    call_id = agi.env.get("agi_uniqueid", str(time.time())).replace(".", "_")
    caller = agi.env.get("agi_callerid", "unknown")
    call_dir = os.path.join(config.WORK_DIR, "calls", call_id)
    os.makedirs(call_dir, exist_ok=True)
    transcript = {"call_id": call_id, "caller": caller, "started": time.time(), "turns": []}
    log.info("call %s from %s", call_id, caller)

    piper = None
    contact_id, system_prompt, error = "", None, ""
    try:
        # set by the userside dialer on outbound campaign calls
        contact_id = agi.get_variable("VL_CONTACT_ID")
        greeting_name, greeting = "greeting", config.GREETING
        if contact_id:
            transcript["contact_id"] = contact_id
            try:
                ctx = backend.call_context(contact_id)
                system_prompt, greeting = ctx["system_prompt"], ctx["greeting"]
                greeting_name = "greet_" + hashlib.sha1(greeting.encode()).hexdigest()[:16]
            except Exception:
                log.exception("call %s: no context from backend, using defaults", call_id)
        log.info("call %s contact=%s", call_id, contact_id or "-")

        agi.answer()
        piper = pipeline.Piper(call_dir)  # loads the voice while the greeting plays
        agi.stream_file(cached_prompt(greeting_name, greeting))

        messages = []
        empty_turns = 0
        agent_said_bye = False
        for turn in range(config.MAX_TURNS):
            rec = os.path.join(call_dir, f"in_{turn}")
            # RECORD FILE stops after N seconds of silence, also before the caller starts
            # talking; so keep listening (~2 s per attempt) until there is actual speech
            spoke = False
            for _ in range(config.WAIT_FOR_SPEECH_ATTEMPTS):
                if os.path.exists(rec + ".wav"):
                    os.remove(rec + ".wav")  # never transcribe a stale file if recording fails
                agi.record_file(rec, max_ms=config.RECORD_MAX_SECONDS * 1000,
                                silence_s=config.RECORD_SILENCE_SECONDS)
                if pipeline.has_speech(rec + ".wav"):
                    spoke = True
                    break

            t0 = time.time()
            user_text = pipeline.speech_to_text(rec + ".wav") if spoke else ""
            t1 = time.time()
            if not user_text:
                empty_turns += 1
                if empty_turns >= 2:
                    break
                agi.stream_file(cached_prompt(
                    "repeat",
                    "Sorry, I did not hear you. Could you please repeat?"
                    if config.LANGUAGE == "en" else "माफ़ कीजिए, मैं सुन नहीं पाया। क्या आप दोहरा सकते हैं?",
                ))
                continue
            empty_turns = 0

            messages.append({"role": "user", "content": user_text})
            # LLM + TTS run in a thread; each sentence is played as soon as it is ready
            parts = pipeline.reply_in_background(messages, piper, os.path.join(call_dir, f"out_{turn}"),
                                                 system_prompt=system_prompt)
            sentences, first_audio = [], None
            while True:
                item = parts.get()
                if item is None:
                    break
                if isinstance(item, Exception):
                    raise item
                sentence, wav = item
                if first_audio is None:
                    first_audio = time.time()
                    agi.verbose(f"voicellm stt={t1 - t0:.2f}s first_audio={first_audio - t1:.2f}s user={user_text}")
                agi.stream_file(wav[:-4])
                sentences.append(sentence)
            reply = " ".join(sentences)
            messages.append({"role": "assistant", "content": reply})

            timing = {
                "stt": round(t1 - t0, 2),
                "first_audio": round((first_audio or time.time()) - t1, 2),
                "silence_total": round((first_audio or time.time()) - t0, 2),
            }
            transcript["turns"].append({"user": user_text, "agent": reply, "timing": timing})
            log.info("call %s turn %d %s | user=%r agent=%r", call_id, turn, timing, user_text, reply)
            if _SAID_GOODBYE.search(reply):
                agent_said_bye = True
                break

        if not agent_said_bye:
            agi.stream_file(cached_prompt("goodbye", config.GOODBYE))
        agi.hangup()
    except Hangup:
        log.info("call %s: caller hung up", call_id)
    except Exception as exc:
        error = f"agent error: {exc}"[:200]
        log.exception("call %s failed", call_id)
        try:
            agi.stream_file("sorry")  # built-in Asterisk sound
            agi.hangup()
        except Exception:
            pass
    finally:
        if piper:
            piper.close()
        transcript["ended"] = time.time()
        if contact_id:
            try:
                backend.report_result(contact_id, transcript["turns"],
                                      transcript["ended"] - transcript["started"], error)
            except Exception:
                log.exception("call %s: could not report result to backend", call_id)
        with open(os.path.join(config.WORK_DIR, "transcripts.jsonl"), "a", encoding="utf-8") as f:
            f.write(json.dumps(transcript, ensure_ascii=False) + "\n")
        if os.environ.get("VA_KEEP_AUDIO") != "1":
            shutil.rmtree(call_dir, ignore_errors=True)


if __name__ == "__main__":
    main()

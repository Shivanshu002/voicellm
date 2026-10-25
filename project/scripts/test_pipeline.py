r"""End-to-end test of STT -> LLM -> TTS without a phone call.

    .venv\Scripts\python.exe scripts\test_pipeline.py              # synthesizes a sample question
    .venv\Scripts\python.exe scripts\test_pipeline.py question.wav

Writes the answer to F:\voicellm\tmp\answer.wav and prints the timings.
"""
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from voice_agent import config, pipeline  # noqa: E402

QUESTION = "Hi, what are your business hours, and can I return a product after ten days?"


def main():
    os.makedirs(config.WORK_DIR, exist_ok=True)
    if len(sys.argv) > 1:
        question_wav = sys.argv[1]
    else:
        question_wav = os.path.join(config.WORK_DIR, "question.wav")
        pipeline.text_to_speech(QUESTION, question_wav, telephone=False)
        print(f"question audio: {question_wav}  ({QUESTION!r})")

    print(f"warming up {config.OLLAMA_MODEL} ...")
    t = time.time()
    pipeline.warm_up_llm()
    print(f"  model load: {time.time() - t:.1f}s")

    t0 = time.time()
    text = pipeline.speech_to_text(question_wav)
    t1 = time.time()
    print(f"STT  {t1 - t0:5.2f}s  {text!r}")

    reply = pipeline.ask_llm([{"role": "user", "content": text}])
    t2 = time.time()
    print(f"LLM  {t2 - t1:5.2f}s  {reply!r}")

    answer_wav = os.path.join(config.WORK_DIR, "answer.wav")
    pipeline.text_to_speech(reply, answer_wav, telephone=False)
    t3 = time.time()
    print(f"TTS  {t3 - t2:5.2f}s  {answer_wav}")
    print(f"TOTAL {t3 - t0:5.2f}s (caller stops talking -> agent starts talking)")


if __name__ == "__main__":
    main()

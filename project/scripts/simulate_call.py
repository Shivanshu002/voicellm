r"""Run agi/voice_agent.py's real call loop against a fake Asterisk (no WSL needed).

    .venv\Scripts\python.exe scripts\simulate_call.py "first question" "second question" ...

Each question is spoken by Piper and "recorded" as the caller's turn; an empty
string "" simulates a silent caller. Without sox, audio stays at 22 kHz.
"""
import importlib.util
import os
import shutil
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from voice_agent import config, pipeline  # noqa: E402

if not shutil.which("sox"):
    pipeline.resample = lambda src, dst, rate: shutil.copyfile(src, dst)

spec = importlib.util.spec_from_file_location("voice_agent_main", os.path.join(ROOT, "agi", "voice_agent.py"))
agent = importlib.util.module_from_spec(spec)
spec.loader.exec_module(agent)


class FakeAGI:
    def __init__(self, questions):
        self.env = {"agi_uniqueid": "sim.1", "agi_callerid": "1001"}
        self.questions = list(questions)

    def answer(self):
        print("[asterisk] ANSWER")

    def get_variable(self, name):
        return os.environ.get(f"SIM_{name}", "")  # e.g. SIM_VL_CONTACT_ID=3 to fake a campaign call

    def verbose(self, msg, level=1):
        print(f"[asterisk] {msg}")

    def stream_file(self, path):
        print(f"[asterisk] play {os.path.basename(path)}.wav")

    def record_file(self, path, **_):
        if not self.questions:
            raise agent.Hangup()
        q = self.questions.pop(0)
        print(f"[caller]   {q!r}")
        if q:
            pipeline.text_to_speech(q, path + ".wav", telephone=False)
        return 0, "timeout"

    def hangup(self):
        print("[asterisk] HANGUP")


def main():
    questions = sys.argv[1:] or [
        "Hi, what time does your store open on Sunday?",
        "",
        "Okay, and can I return a product without a bill?",
        "Thank you, that's all.",
    ]
    os.environ["VA_KEEP_AUDIO"] = "1"
    shutil.rmtree(os.path.join(config.WORK_DIR, "calls", "sim_1"), ignore_errors=True)
    agent.AGI = lambda: FakeAGI(questions)
    agent.main()
    with open(os.path.join(config.WORK_DIR, "transcripts.jsonl"), encoding="utf-8") as f:
        last = f.readlines()[-1]
    print("\ntranscript:", last)


if __name__ == "__main__":
    main()

# VoiceLLM — self-hosted AI calling agent

Upload a customer list, describe the call, press **Run**. VoiceLLM dials each number,
holds a short natural conversation, and shows every transcript on a dashboard.

Speech-to-text, the language model and the voice all run **on your own machine** —
no OpenAI/Google/ElevenLabs API. The only outside service is the phone line (a SIP trunk).

| | |
|---|---|
| Phone calls | [Asterisk](https://www.asterisk.org/) 20 (in WSL2 on Windows) |
| Speech → text | [whisper.cpp](https://github.com/ggml-org/whisper.cpp) |
| Conversation | Llama 3.2 3B via [Ollama](https://ollama.com/) |
| Text → speech | [Piper](https://github.com/rhasspy/piper) |
| Accounts, campaigns, dialer | FastAPI + SQLite |
| Website & dashboard | React + Vite + Tailwind |

## What it does

- **Landing page + company accounts** — every company gets its own private workspace.
- **Campaigns** — upload Excel/CSV or paste numbers, write the first sentence and the purpose of the call, press Run.
- **Live results** — status per number, full transcript per call, call logs with search, CSV export.
- **Safeguards** — calling hours per company, do-not-call list (callers who say "don't call me" are added automatically).
- **Inbound too** — the same agent answers incoming calls using your business details.

Measured on a laptop (i5-8250U, 12 GB RAM, no GPU): **~3 s** from the caller's last word to the agent's reply.

## How a call works

```
Run ─► dialer ─► Asterisk ─► phone rings ─► answered
                                   │
              AGI voice agent ◄────┘
   record ─► whisper.cpp ─► Ollama (streamed, sentence by sentence) ─► Piper ─► play
                                   │
              transcript + status ─► dashboard
```

## Repository layout

```
project/    the voice agent: AGI script, STT/LLM/TTS pipeline, Asterisk configs, setup scripts
userside/   the product: FastAPI backend (accounts, campaigns, dialer) + React frontend
```

Large files (models, tool binaries, the WSL disk) are **not** in git; a script downloads them.

## Quick start (Windows 10/11)

Requirements: ~30 GB free disk, 12 GB+ RAM, Python 3.11+, Node 20+, Git, virtualization enabled.

```powershell
git clone https://github.com/Shivanshu002/lama-calling-agent.git voicellm
cd voicellm

# 1. download models and tools (~6 GB, no admin)
powershell -ExecutionPolicy Bypass -File project\scripts\download_assets.ps1

# 2. install WSL + Ubuntu + Asterisk (Administrator PowerShell, then restart;
#    setup continues by itself after you log in)
powershell -ExecutionPolicy Bypass -File project\scripts\install_wsl.ps1

# 3. after setup finished: Python env for the Windows-side tools
py -m venv project\.venv; project\.venv\Scripts\pip install -r project\requirements.txt

# 4. connect the dashboard backend to Asterisk
powershell -ExecutionPolicy Bypass -File userside\backend\scripts\link_asterisk.ps1

# 5. start everything
powershell -ExecutionPolicy Bypass -File project\scripts\start_all.ps1
powershell -ExecutionPolicy Bypass -File userside\start.ps1
```

Open **http://localhost:5173**, register a company, create a campaign.

Until you have a phone number, every call rings a softphone on your own PC
([MicroSIP](https://www.microsip.org/): server `127.0.0.1:5080`, user `1001`,
password `voicellm1001`). For real numbers, fill in the SIP trunk in
`project/asterisk/pjsip.conf` and set `DIAL_MODE=trunk` in `userside/backend/.env`.

More detail: [project/README.md](project/README.md) (voice agent, benchmarks, tuning) ·
[userside/README.md](userside/README.md) (backend, dialer, settings).

## Tests

```powershell
project\.venv\Scripts\python.exe -m unittest discover project\tests
cd userside\backend; .venv\Scripts\python.exe -m pytest -q
cd userside\frontend; npm run build
```

## Responsible use

Automated calling is regulated. Call only people who agreed to hear from you,
respect national do-not-call registries and calling hours, and follow your
regulator's rules (in India: TRAI's commercial communication regulations / DLT).
VoiceLLM provides the do-not-call list and calling-hour controls; compliance is the operator's responsibility.

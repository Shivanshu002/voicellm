# VoiceLLM – userside (landing page + company dashboard)

Companies register, upload customer numbers (Excel/CSV or paste), describe the call,
and press **Run**. The backend dials each number through Asterisk; the self-hosted
voice agent (`F:\voicellm\project`) holds the conversation and the transcript shows
up on the dashboard.

```
userside\
 ├─ backend\    FastAPI + SQLite (data\app.db)
 │   ├─ app\main.py          API + starts the dialer
 │   ├─ app\routers\         auth, company (settings, stats, do-not-call), campaigns, internal (for the agent)
 │   ├─ app\dialer.py        picks pending numbers of running campaigns, places calls (AMI)
 │   ├─ app\ami.py           Asterisk Manager Interface client
 │   ├─ app\agent_context.py greeting + system prompt per call, opt-out detection
 │   └─ scripts\link_asterisk.ps1
 └─ frontend\   React 18 + Vite + Tailwind
     └─ src\pages\           Landing, Login, Register, app\ (Dashboard, Campaigns, CampaignDetail, Settings)
```

## Call flow

```
Run ─► dialer ─► AMI Originate Local/<number>@voicellm-dialout
                     │  softphone mode: rings MicroSIP 1001 · trunk mode: real number
                     ▼  answered
           outbound-ai ─► voice_agent.py (AGI) ─► GET /api/internal/calls/<id>/context
                                               ◄─ greeting + prompt (company + campaign)
                          ... conversation ...
                          POST /api/internal/calls/<id>/result ─► transcript, status, opt-out ─► dashboard
```

## First-time setup

1. The voice agent must be installed and running (`project\README.md`).
2. Link backend ↔ Asterisk (creates the AMI password and the agent's token, copies them into WSL):
   ```powershell
   powershell -ExecutionPolicy Bypass -File F:\voicellm\userside\backend\scripts\link_asterisk.ps1
   ```

## Every day

```powershell
powershell -ExecutionPolicy Bypass -File F:\voicellm\project\scripts\start_all.ps1   # Ollama + Asterisk
powershell -ExecutionPolicy Bypass -File F:\voicellm\userside\start.ps1              # backend + frontend
```
Open http://localhost:5173.

## Settings (`backend\.env`)

| Key | Default | Meaning |
|---|---|---|
| `DIAL_MODE` | `softphone` | `softphone`: every call rings MicroSIP 1001 (testing) · `trunk`: real numbers through the SIP trunk · `robot`: automated test caller |
| `MAX_GLOBAL_CALLS` | `1` | parallel calls this machine handles (laptop CPU: 1) |
| `RING_TIMEOUT_SECONDS` | `30` | how long a number rings before "no answer" |
| `AMI_SECRET` | – | written by `link_asterisk.ps1` |
| `OLLAMA_MODEL` | `llama3.2:3b` | the dialer waits until this model is loaded |

## Safeguards

- Calls only inside each company's calling hours (IST, default 9 AM–9 PM).
- Per-company do-not-call list; a callee who says "don't call me", "not interested",
  "call mat karna"… is added automatically.
- Companies only see their own data (every query is scoped to the logged-in company).
- Commercial calling in India also needs TRAI/DLT compliance and consent – the
  product cannot do that part for the company.

## Tests

```powershell
cd F:\voicellm\userside\backend; .venv\Scripts\python.exe -m pytest -q
cd F:\voicellm\userside\frontend; npm run build
```

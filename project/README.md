# Self-Hosted Inbound Voice AI Agent (No Third-Party AI API)

Customer inbound calls ko AI se handle karne ka fully self-hosted setup.
Sirf **SIP trunk** (phone number) external hai — speech-to-text, LLM aur
text-to-speech sab apne machine par chalte hain.

Ye version **Windows 11 laptop** par chalne ke liye bana hai: Ollama Windows par
native chalta hai, Asterisk WSL2 (Ubuntu 24.04) ke andar. Sab kuch `F:\voicellm`
mein hai (WSL ki disk bhi).

## Architecture

```
Caller ─► SIP trunk / softphone ─► Asterisk (WSL) ─► AGI: voice_agent.py
                                                        │
                       ┌────────────────────────────────┼─────────────────────┐
                       ▼                                ▼                     ▼
                 whisper.cpp (WSL)          Ollama (Windows, llama3.2:3b)   Piper (WSL)
                 speech → text              text → reply  (localhost:11434)  reply → audio
```

Har turn: Asterisk caller ko record karta hai (2 sec chup = turn khatam) →
whisper text banata hai → Ollama jawab **stream** karta hai → har sentence
banate hi Piper (ek hi process, model ek baar load) usko 8 kHz audio banata hai
→ Asterisk turant play karta hai, baaki sentences peeche bante rehte hain.
Greeting/goodbye cache hote hain. Agent sirf `business_info.txt` ki jaankari se
jawab deta hai — **ise apne business ki details se badlo**.

## Folder layout

```
F:\voicellm\
 ├─ project\              ← ye repo (code, configs, scripts)
 │   ├─ voice_agent\      ← pipeline.py (STT/LLM/TTS), agi.py (AGI client), config.py
 │   ├─ agi\voice_agent.py← Asterisk AGI entry point
 │   ├─ asterisk\         ← pjsip.conf, extensions.conf
 │   ├─ scripts\          ← install_wsl.ps1, setup_wsl.sh, deploy_wsl.sh, start_all.ps1,
 │   │                      test_call_wsl.sh, test_pipeline.py, simulate_call.py
 │   ├─ tests\            ← unit tests
 │   └─ business_info.txt ← agent ki knowledge (hours, prices, policies) — apni details daalo
 ├─ tools\                ← ollama, whisper.cpp, piper (Windows binaries)
 ├─ models\               ← ollama models, whisper ggml models, piper voices
 ├─ downloads\            ← original archives (setup_wsl.sh inme se Linux binaries leta hai)
 ├─ wsl\                  ← Ubuntu 24.04 virtual disk (ext4.vhdx)
 ├─ logs\                 ← install aur ollama logs
 └─ tmp\                  ← Windows test output
```

## Install (ek baar)

1. **Administrator PowerShell** kholo aur chalao:
   ```powershell
   powershell -ExecutionPolicy Bypass -File F:\voicellm\project\scripts\install_wsl.ps1
   ```
2. **Restart** karo. Login ke baad ek window khulegi jo Ubuntu install karke
   `setup_wsl.sh` chalayegi (Asterisk, sox, whisper, piper, configs). Log:
   `F:\voicellm\logs\wsl_setup.log` aur `setup_wsl_inner.log`.
3. Aakhir mein "setup_wsl.sh finished OK" dikhna chahiye.

Note: `install_wsl.ps1` `C:\Users\<you>\.wslconfig` bhi likhta hai (WSL ki RAM
4 GB tak, `networkingMode=mirrored` taaki WSL aur Windows `localhost` share karein).
Ye file Windows ko wahi chahiye, F: par nahi ho sakti.

## Roz start karna

```powershell
powershell -ExecutionPolicy Bypass -File F:\voicellm\project\scripts\start_all.ps1
```
Ollama start karta hai, model RAM mein load karta hai, Asterisk start karta hai.

## Test call (bina phone number ke)

**Automatic (robot caller):** Asterisk ke andar ek nakli caller sawaal bolta hai,
agent asli raste (Asterisk → AGI → whisper → Ollama → Piper) se jawab deta hai:
```powershell
wsl -d Ubuntu-24.04 -u root -- bash /mnt/f/voicellm/project/scripts/test_call_wsl.sh "Can I pay with UPI?"
```

**Code / `business_info.txt` / configs badalne ke baad** WSL mein copy karo:
```powershell
wsl -d Ubuntu-24.04 -u root -- bash /mnt/f/voicellm/project/scripts/deploy_wsl.sh
```

**Apni awaaz se (softphone):**

1. [MicroSIP](https://www.microsip.org/downloads) install karo (portable version F: par rakh sakte ho).
2. Account add karo:
   - SIP Server / Domain: `127.0.0.1:5080`
   - Username / Login: `1001`
   - Password: `voicellm1001`
3. `100` dial karo → greeting sunai degi → bolo → 2 sec chup raho → AI jawab dega.

Debug:
```powershell
wsl -d Ubuntu-24.04 -u root -- asterisk -rvvv                       # live console
wsl -d Ubuntu-24.04 -u root -- tail -f /var/spool/asterisk/voicellm/voice_agent.log
wsl -d Ubuntu-24.04 -u root -- tail -1 /var/spool/asterisk/voicellm/transcripts.jsonl
```

## Bina Asterisk ke test (Windows)

```powershell
cd F:\voicellm\project
.venv\Scripts\python.exe scripts\test_pipeline.py      # ek sawaal: STT -> LLM -> TTS timings
.venv\Scripts\python.exe scripts\simulate_call.py "Do you open on Sunday?" "" "Can I pay with UPI?"
.venv\Scripts\python.exe -m unittest discover tests     # AGI protocol + sentence streaming tests
```
`simulate_call.py` asli `agi/voice_agent.py` call loop ko ek nakli Asterisk ke
saath chalata hai (`""` = caller chup raha). Audio `F:\voicellm\tmp\calls\` mein.

## Settings (environment variables)

| Variable | Default | Matlab |
|---|---|---|
| `VA_LANGUAGE` | `en` | `hi` = Hindi (multilingual whisper + `hi_IN-pratham` voice) |
| `VA_OLLAMA_MODEL` | `llama3.2:3b` | `llama3.1:8b` better hai lekin is laptop par ~3x slow |
| `VA_BUSINESS_INFO` | `business_info.txt` | agent ki knowledge wali file |
| `VA_SYSTEM_PROMPT` | support agent | poora system prompt badalna ho to |
| `VA_MAX_TURNS` | `8` | ek call mein kitne sawaal-jawab |
| `VA_RECORD_SILENCE_SECONDS` | `2` | kitni der chup = turn khatam |
| `VA_KEEP_AUDIO` | off | `1` = call ki recordings delete na ho |

AGI script Asterisk ke environment se chalti hai, isliye WSL mein permanent
setting ke liye `config.py` ke default badlo aur `setup_wsl.sh` dobara chalao
(code `/opt/voicellm/app` mein copy hota hai).

## Real phone number (SIP trunk)

`asterisk/pjsip.conf` mein `trunk` wala block uncomment karke provider ki details
daalo, `setup_wsl.sh` dobara chalao. Production ke liye laptop/WSL ki jagah
Linux VPS lo — wahan transport par `external_media_address` /
`external_signaling_address` set karo aur firewall mein SIP port sirf provider
ke IPs ke liye kholo.

## Benchmarks (is laptop par: i5-8250U, 12 GB RAM, HDD, no GPU)

`simulate_call.py`, 4-turn English call, model RAM mein loaded:

| Turn | STT | Pehla sentence (LLM + TTS) | Caller ka total wait* |
|---|---|---|---|
| "What time do you open on Sunday?" | 0.96 s | 1.59 s | 2.6 s |
| "Can I pay with UPI?" | 0.91 s | 1.77 s | 2.7 s |
| "Can I return a phone without the bill?" | 0.93 s | 2.39 s | 3.3 s |
| "Do you deliver to my home?" | 1.02 s | 3.51 s | 4.5 s |

\* caller ke chup hone ke 2 sec (silence detection) iske upar hain.

Asli Asterisk call (WSL, 8 kHz, `test_call_wsl.sh`): "Can I pay with UPI?" →
STT 0.92 s, pehli awaaz 1.97 s, **total 2.9 s**. WSL boot ke baad Asterisk ko
start hone mein ~40 s lagte hain (HDD), aur pehli call ka STT ~4 s (model cold).

Kya kiya ki speed aaye (shuru mein ek turn ~14 s tha):
- whisper `-ac` clip ki length ke hisaab se (STT ~2.3 s → ~0.9 s), `-mc 0`
- LLM streaming + sentence-wise TTS + comma par pehla tukda
- Piper ek persistent process (model load 1.6 s sirf call ke shuru mein, greeting ke dauraan)
- Ollama `keep_alive` 2h — model RAM se nahi hatta (HDD se load ~5 s)
- `llama3.2:3b` (~10.7 tokens/s is CPU par); `llama3.1:8b` ~3x slow hoga

History badhne par LLM prompt lamba hota hai, isliye baad ke turns thode slow hain.
Ollama restart ke baad pehli call ka pehla turn ~4 s (system prompt `start_all.ps1`
warm-up mein pehle se process ho jata hai; warna ~9 s).
`business_info.txt` badalne ke baad `start_all.ps1` dobara chalao.

**Hindi** (`VA_LANGUAGE=hi`): whisper `small` model chahiye (`base` Hindi ko Urdu
script mein likhta hai). Is laptop par Hindi STT ~5–7 s leta hai aur 3B model ki
Hindi kamzor hai — English se shuru karo.

Aage ke upgrades:
- AGI → ARI + streaming STT (barge-in, caller beech mein bol sake)
- Ollama streaming + sentence-wise TTS (pehla sentence jaldi bole)
- RAG: FAQ/product docs se jawab (chromadb / sqlite-vec)

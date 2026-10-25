# Starts the userside backend (FastAPI, port 8000) and frontend (Vite, port 5173),
# each in its own window. Run project\scripts\start_all.ps1 first (Ollama + Asterisk).
#   powershell -ExecutionPolicy Bypass -File F:\voicellm\userside\start.ps1
$Root = $PSScriptRoot
$Node = "C:\Program Files\nodejs"

if (-not (Test-Path "$Root\backend\.venv")) {
    py -m venv "$Root\backend\.venv"
    & "$Root\backend\.venv\Scripts\python.exe" -m pip install -q -r "$Root\backend\requirements.txt"
}
if (-not (Test-Path "$Root\frontend\node_modules")) {
    Push-Location "$Root\frontend"; & "$Node\npm.cmd" install --no-audit --no-fund; Pop-Location
}

Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$Root\backend'; `$host.UI.RawUI.WindowTitle='VoiceLLM backend'; .venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command",
    "cd '$Root\frontend'; `$host.UI.RawUI.WindowTitle='VoiceLLM frontend'; `$env:Path='$Node;'+`$env:Path; npm run dev"

Start-Sleep 5
Start-Process "http://localhost:5173"

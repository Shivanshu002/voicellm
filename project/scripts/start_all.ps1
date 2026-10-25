# Start everything: Ollama (Windows) + Asterisk (WSL). Safe to run again.
#   powershell -ExecutionPolicy Bypass -File F:\voicellm\project\scripts\start_all.ps1
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path   # repository root
$Distro = "Ubuntu-24.04"
$Model = if ($env:VA_OLLAMA_MODEL) { $env:VA_OLLAMA_MODEL } else { "llama3.2:3b" }

$env:OLLAMA_MODELS = "$Root\models\ollama"
$env:OLLAMA_HOST = "127.0.0.1:11434"
$env:OLLAMA_KEEP_ALIVE = "-1"  # never unload the model (HDD reload > 1 min)
$ollama = "$Root\tools\ollama\ollama.exe"

function OllamaUp { try { Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 2 | Out-Null; $true } catch { $false } }

if (-not (OllamaUp)) {
    Write-Host "Starting Ollama..."
    New-Item -ItemType Directory -Force "$Root\logs" | Out-Null
    Start-Process -FilePath $ollama -ArgumentList "serve" -WindowStyle Hidden `
        -RedirectStandardError "$Root\logs\ollama.log" -RedirectStandardOutput "$Root\logs\ollama.out.log"
    for ($i = 0; $i -lt 30 -and -not (OllamaUp); $i++) { Start-Sleep 1 }
}
Write-Host "Ollama up: $(OllamaUp)"

Write-Host "Loading $Model into RAM (first time from HDD takes ~30s)..."
# also pre-processes the system prompt + business_info.txt so the first caller does not wait
& "$Root\project\.venv\Scripts\python.exe" -c "import sys; sys.path.insert(0, r'$Root\project'); from voice_agent import pipeline; pipeline.warm_up_llm()"
if ($LASTEXITCODE -eq 0) { Write-Host "Model loaded." } else { Write-Host "Model load failed" -ForegroundColor Red }

$hasWsl = (wsl.exe -l -q 2>$null) -replace "`0", "" | Where-Object { $_.Trim() -eq $Distro }
if ($hasWsl) {
    Write-Host "Starting Asterisk in WSL..."
    # WSL stops a distro when no wsl.exe process is attached; keep one hidden process alive
    # (wsl.exe does not understand single quotes, so no bash -c '...' here)
    $keep = Get-CimInstance Win32_Process -Filter "Name='wsl.exe'" | Where-Object { $_.CommandLine -like "*$Distro*sleep infinity*" }
    if (-not $keep) {
        Start-Process wsl.exe -ArgumentList "-d $Distro -u root -- sleep infinity" -WindowStyle Hidden
        Start-Sleep 3
    }
    wsl.exe -d $Distro -u root -- systemctl start asterisk
    # Asterisk takes ~40 s to load its modules from the HDD
    for ($i = 0; $i -lt 90; $i++) {
        if ((wsl.exe -d $Distro -u root -- systemctl is-active asterisk) -eq "active") { break }
        Start-Sleep 2
    }
    wsl.exe -d $Distro -u root -- asterisk -rx "pjsip show endpoints"
} else {
    Write-Host "WSL/Ubuntu not installed yet - run scripts\install_wsl.ps1 as Administrator." -ForegroundColor Yellow
}

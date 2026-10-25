# Downloads everything that is too big for git (~6 GB) into the repository folder:
#   downloads\  release archives (setup_wsl.sh takes the Linux builds from here)
#   tools\      Ollama, whisper.cpp, Piper for Windows
#   models\     Whisper models, Piper voices, the Ollama LLM
# Safe to run again: existing files are skipped. No admin rights needed.
#   powershell -ExecutionPolicy Bypass -File <repo>\project\scripts\download_assets.ps1
$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path
$Model = if ($env:VA_OLLAMA_MODEL) { $env:VA_OLLAMA_MODEL } else { "llama3.2:3b" }
$HF = "https://huggingface.co"

$Archives = [ordered]@{
    "ollama-windows-amd64.zip"      = "https://github.com/ollama/ollama/releases/download/v0.40.11/ollama-windows-amd64.zip"
    "whisper-bin-x64.zip"           = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-x64.zip"
    "whisper-bin-ubuntu-x64.tar.gz" = "https://github.com/ggml-org/whisper.cpp/releases/download/b5454/whisper-bin-ubuntu-x64.tar.gz"
    "piper_windows_amd64.zip"       = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_windows_amd64.zip"
    "piper_linux_x86_64.tar.gz"     = "https://github.com/rhasspy/piper/releases/download/2023.11.14-2/piper_linux_x86_64.tar.gz"
}
$Models = [ordered]@{
    "whisper\ggml-base.en.bin"               = "$HF/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin"
    "whisper\ggml-small.bin"                 = "$HF/ggerganov/whisper.cpp/resolve/main/ggml-small.bin"
    "piper\en_US-amy-medium.onnx"            = "$HF/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx"
    "piper\en_US-amy-medium.onnx.json"       = "$HF/rhasspy/piper-voices/resolve/main/en/en_US/amy/medium/en_US-amy-medium.onnx.json"
    "piper\hi_IN-pratham-medium.onnx"        = "$HF/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx"
    "piper\hi_IN-pratham-medium.onnx.json"   = "$HF/rhasspy/piper-voices/resolve/main/hi/hi_IN/pratham/medium/hi_IN-pratham-medium.onnx.json"
}

function Fetch($url, $dest) {
    if ((Test-Path $dest) -and (Get-Item $dest).Length -gt 0) { Write-Host "  have $(Split-Path $dest -Leaf)"; return }
    New-Item -ItemType Directory -Force (Split-Path $dest) | Out-Null
    Write-Host "  downloading $(Split-Path $dest -Leaf) ..."
    curl.exe -fL --retry 5 -C - -o "$dest.part" $url
    if ($LASTEXITCODE -ne 0) { throw "download failed: $url" }
    Move-Item -Force "$dest.part" $dest
}

Write-Host "== archives"
foreach ($name in $Archives.Keys) { Fetch $Archives[$name] "$Root\downloads\$name" }

Write-Host "== models"
foreach ($rel in $Models.Keys) { Fetch $Models[$rel] "$Root\models\$rel" }

Write-Host "== unpack Windows tools"
$unpack = @{ "ollama" = "ollama-windows-amd64.zip"; "whisper" = "whisper-bin-x64.zip"; "piper" = "piper_windows_amd64.zip" }
foreach ($tool in $unpack.Keys) {
    if (-not (Test-Path "$Root\tools\$tool")) {
        Expand-Archive -Path "$Root\downloads\$($unpack[$tool])" -DestinationPath "$Root\tools\$tool"
    }
}

Write-Host "== LLM ($Model)"
$env:OLLAMA_MODELS = "$Root\models\ollama"
$env:OLLAMA_HOST = "127.0.0.1:11434"
$up = $false
try { Invoke-RestMethod "http://127.0.0.1:11434/api/version" -TimeoutSec 2 | Out-Null; $up = $true } catch {}
if (-not $up) {
    Start-Process -FilePath "$Root\tools\ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Hidden
    Start-Sleep 5
}
& "$Root\tools\ollama\ollama.exe" pull $Model

Write-Host "`nDone. Next: project\scripts\install_wsl.ps1 from an Administrator PowerShell." -ForegroundColor Green

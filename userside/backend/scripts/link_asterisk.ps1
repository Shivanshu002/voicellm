# Connects the backend to Asterisk in WSL. Safe to run again.
#   powershell -ExecutionPolicy Bypass -File F:\voicellm\userside\backend\scripts\link_asterisk.ps1
# - creates a random AMI password, writes it to backend\.env and project\asterisk\manager.conf
# - makes sure backend\data\internal_token exists (shared with the AGI agent)
# - copies both into WSL and reloads Asterisk
$ErrorActionPreference = "Stop"
$Backend = Split-Path -Parent $PSScriptRoot
$Root = (Resolve-Path "$Backend\..\..").Path   # repository root
$Project = "$Root\project"
$WslRoot = "/mnt/" + $Root.Substring(0, 1).ToLower() + ($Root.Substring(2) -replace '\\', '/')
$Distro = "Ubuntu-24.04"

$envFile = Join-Path $Backend ".env"
$lines = @()
if (Test-Path $envFile) { $lines = Get-Content $envFile }
$secretLine = $lines | Where-Object { $_ -match '^AMI_SECRET=.+' } | Select-Object -First 1
if ($secretLine) {
    $secret = $secretLine.Substring("AMI_SECRET=".Length)
} else {
    $bytes = New-Object byte[] 24
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    $secret = ([Convert]::ToBase64String($bytes)) -replace '[+/=]', ''
    $lines = @($lines | Where-Object { $_ -notmatch '^AMI_SECRET=' }) + "AMI_SECRET=$secret"
    Set-Content -Path $envFile -Value $lines -Encoding ascii
    Write-Host "AMI password written to $envFile"
}

(Get-Content "$Project\asterisk\manager.conf.example") -replace 'CHANGE_ME', $secret |
    Set-Content -Path "$Project\asterisk\manager.conf" -Encoding ascii

$token = Join-Path $Backend "data\internal_token"
if (-not (Test-Path $token)) {
    New-Item -ItemType Directory -Force (Split-Path $token) | Out-Null
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
    ([Convert]::ToBase64String($bytes) -replace '[+/=]', '') | Set-Content -Path $token -NoNewline -Encoding ascii
}

wsl.exe -d $Distro -u root -- bash "$WslRoot/project/scripts/deploy_wsl.sh"
Write-Host "Asterisk linked. Restart the backend if it is running."

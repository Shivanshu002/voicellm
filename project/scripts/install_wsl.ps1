# Run ONCE from an Administrator PowerShell (after scripts\download_assets.ps1):
#   powershell -ExecutionPolicy Bypass -File <repo>\project\scripts\install_wsl.ps1
#
# Phase 1 (admin, now):        enables WSL, writes .wslconfig, schedules phase 2, asks for restart.
# Phase 2 (after restart/login, automatic): installs Ubuntu 24.04 into <repo>\wsl
#                               and runs setup_wsl.sh inside it. Log: <repo>\logs\wsl_setup.log
param([switch]$Phase2)

$ErrorActionPreference = "Stop"
$Root = (Resolve-Path "$PSScriptRoot\..\..").Path   # repository root
# the same folder seen from inside WSL: F:\voicellm -> /mnt/f/voicellm
$WslRoot = "/mnt/" + $Root.Substring(0, 1).ToLower() + ($Root.Substring(2) -replace '\\', '/')
$Distro = "Ubuntu-24.04"
$LogDir = "$Root\logs"
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Log = "$LogDir\wsl_setup.log"
function Log($msg) { $line = "$(Get-Date -Format s) $msg"; Write-Host $line; Add-Content -Path $Log -Value $line -Encoding utf8 }

if (-not $Phase2) {
    $admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
        [Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $admin) { throw "Run this from an Administrator PowerShell." }

    Log "Phase 1: installing WSL platform"
    wsl.exe --install --no-distribution
    Log "wsl --install exit code $LASTEXITCODE"

    # WSL settings: RAM cap (Ollama runs on Windows, not inside WSL) and shared localhost
    $cfg = "$env:USERPROFILE\.wslconfig"
    @"
[wsl2]
memory=4GB
processors=6
networkingMode=mirrored
"@ | Set-Content -Path $cfg -Encoding ascii
    Log "wrote $cfg"

    # Phase 2 runs at next login, as the normal user
    $cmd = "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Normal -File `"$PSCommandPath`" -Phase2"
    New-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\RunOnce" `
        -Name "voicellm-wsl" -Value $cmd -PropertyType String -Force | Out-Null
    Log "Phase 2 scheduled for next login. Restart the computer now."
    Write-Host "`n>>> Restart karo. Login ke baad Ubuntu install + setup apne aap chalega (~30-60 min). <<<`n" -ForegroundColor Green
    exit 0
}

# ---------------- Phase 2 ----------------
Log "Phase 2: installing Ubuntu"
$installed = (wsl.exe -l -q) -replace "`0", "" | Where-Object { $_.Trim() -eq $Distro }
if (-not $installed) {
    Log "installing $Distro into $Root\wsl"
    New-Item -ItemType Directory -Force "$Root\wsl" | Out-Null
    wsl.exe --install -d $Distro --location "$Root\wsl" --no-launch
    if ($LASTEXITCODE -ne 0) {
        Log "--location not supported, installing normally then moving to F:"
        wsl.exe --install -d $Distro --no-launch
        wsl.exe --shutdown
        wsl.exe --manage $Distro --move "$Root\wsl"
    }
}
Log "running setup_wsl.sh as root inside $Distro"
wsl.exe -d $Distro -u root -- bash "$WslRoot/project/scripts/setup_wsl.sh" 2>&1 |
    ForEach-Object { $_ -replace "`0", "" } | Tee-Object -FilePath "$LogDir\setup_wsl_inner.log" -Append
Log "setup_wsl.sh exit code $LASTEXITCODE"

& "$Root\project\scripts\start_all.ps1"
Log "Phase 2 done. See $Root\project\README.md -> 'Test call'"
Read-Host "Done. Press Enter to close"

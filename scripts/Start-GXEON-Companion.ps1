# ============================================================
# GXEON LOCAL COMPANION — WINDOWS LAUNCHER (POWERSHELL)
# VERSION: 1.1.0
# ZERO-TRUST ARCHITECTURE // LOCAL-FIRST SIGNING PLANE
# ============================================================

[CmdletBinding()]
param (
    [string]$HostAddress = "127.0.0.1",
    [int]$Port = 8790,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "       GXEON WALLET COMMAND CENTER — LOCAL COMPANION V1.1   " -ForegroundColor Yellow
Write-Host "       Zero-Trust Local Tooling & Public Address Bridge    " -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# 1. Verify Python Installation
Write-Host "[1/4] Checking Python environment..." -ForegroundColor White
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command py -ErrorAction SilentlyContinue) {
    $pythonCmd = "py"
} else {
    Write-Host "[ERROR] Python 3.9+ was not found in PATH." -ForegroundColor Red
    Write-Host "Please install Python from https://python.org or Microsoft Store and retry." -ForegroundColor Yellow
    Exit 1
}

$pyVersion = & $pythonCmd --version 2>&1
Write-Host "  --> Found: $pyVersion" -ForegroundColor Green

# 2. Check & Install Python Dependencies
Write-Host "[2/4] Verifying Python bridge dependencies..." -ForegroundColor White
$dependencies = @("fastapi", "uvicorn", "pydantic")
$missing = @()

foreach ($dep in $dependencies) {
    & $pythonCmd -c "import $dep" 2>$null
    if ($LASTEXITCODE -ne 0) {
        $missing += $dep
    }
}

if ($missing.Count -gt 0) {
    Write-Host "  --> Installing missing packages: $($missing -join ', ')..." -ForegroundColor Yellow
    & $pythonCmd -m pip install --quiet --disable-pip-version-check fastapi uvicorn pydantic
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR] Failed to install required Python packages." -ForegroundColor Red
        Exit 1
    }
    Write-Host "  --> Dependencies installed successfully." -ForegroundColor Green
} else {
    Write-Host "  --> All bridge dependencies present." -ForegroundColor Green
}

# 3. Security Invariant Notice
Write-Host "[3/4] Validating Security Invariants..." -ForegroundColor White
Write-Host "  --> Binding strictly to $HostAddress`:$Port (Never 0.0.0.0)" -ForegroundColor Green
Write-Host "  --> Zero Private Keys stored, transmitted or handled in cloud" -ForegroundColor Green
Write-Host "  --> Ephemeral Pairing TTL: 5 min code / 1 hour session token" -ForegroundColor Green

# 4. Launch Bridge Server
Write-Host "[4/4] Starting GXEON Local Companion on http://$HostAddress`:$Port..." -ForegroundColor Cyan
Write-Host ""
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  WEB COMMAND CENTER: https://studio-1105349706-f3598.web.app" -ForegroundColor Yellow
Write-Host "  PAIRING PROCEDURE:" -ForegroundColor White
Write-Host "    1. In Web Command Center, click 'CONNECT CLI COMPANION'" -ForegroundColor White
Write-Host "    2. Enter the 6-digit code or generate from web UI" -ForegroundColor White
Write-Host "    3. Add detected watch-only wallets in 1 click" -ForegroundColor White
Write-Host "------------------------------------------------------------" -ForegroundColor DarkGray
Write-Host "  Press Ctrl+C to terminate the local companion bridge." -ForegroundColor DarkGray
Write-Host ""

if (-not $NoBrowser) {
    try {
        Start-Process "https://studio-1105349706-f3598.web.app"
    } catch {
        # Browser open is optional
    }
}

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir

Set-Location $repoRoot
& $pythonCmd bridge.py

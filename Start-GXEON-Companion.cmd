@echo off
title GXEON Local Companion V1.1
color 0B

echo ============================================================
echo   GXEON WALLET COMMAND CENTER - LOCAL COMPANION LAUNCHER
echo ============================================================
echo.

where powershell >nul 2>nul
if %ERRORLEVEL% equ 0 (
    powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\Start-GXEON-Companion.ps1"
) else (
    echo [WARNING] PowerShell not detected, running python directly...
    where python >nul 2>nul
    if %ERRORLEVEL% equ 0 (
        python "%~dp0bridge.py"
    ) else (
        echo [ERROR] Neither PowerShell nor Python was found in PATH.
        echo Please install Python 3.9+ and try again.
        pause
    )
)

if %ERRORLEVEL% neq 0 (
    echo.
    echo Bridge terminated with exit code %ERRORLEVEL%.
    pause
)

# GXEON Local Companion — Windows Launcher Guide

This document describes the Windows launch utilities designed for seamless operator startup.

---

## 1. Launcher Files

1. **`Start-GXEON-Companion.cmd`** (Root Directory):
   - Double-clickable batch wrapper.
   - Automatically detects PowerShell or Python in the environment and executes the setup pipeline.
   - Preserves error output if Python is not found.

2. **`scripts/Start-GXEON-Companion.ps1`**:
   - PowerShell script handling full pre-flight verification:
     - Detects Python 3.9+.
     - Verifies required packages (`fastapi`, `uvicorn`, `pydantic`).
     - Auto-installs missing dependencies if needed.
     - Confirms security invariants (bind to `127.0.0.1:8790`, no private keys).
     - Launches `bridge.py` and opens the Web Command Center in the default browser.

---

## 2. Usage Instructions

1. Double-click `Start-GXEON-Companion.cmd` in the repository root.
2. Observe the terminal output confirming that the bridge is running at `http://127.0.0.1:8790`.
3. In the browser window that opens (`https://studio-1105349706-f3598.web.app`), click **"Connect CLI Companion"**.
4. Enter the 6-digit code or generate code from the UI to complete the pairing handshake.
5. Click **"Add to GXEON"** on any discovered public wallets.

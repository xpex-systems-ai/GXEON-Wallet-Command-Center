# GXEON Wallet Command Center

Central QG for wallets controlled by GXEON.

## Principles

- **Watch-only by default**
- **No private keys, seeds, passwords, recovery codes or signing material in GitHub/cloud**
- Public addresses and metadata only in this repository
- Local CLI bridge performs wallet-specific reads/signing on the operator machine
- Transfers require explicit human confirmation

## Initial wallet registry

RustChain RTC address currently used in bounty submissions:

`RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`

Status: **WATCH_ONLY / ownership not yet verified locally**

## Local architecture

```
Dashboard / CLI
      |
      v
GXEON Wallet Registry
      |
      v
Local Bridge 127.0.0.1:8790
      |
      +--> RustChain CLI / APIs
      +--> future wallet adapters
```

## Quick start

Requires Python 3.11+.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python bridge.py
```

Then open a second terminal:

```powershell
python gxeon_wallet.py list
python gxeon_wallet.py health
```

The bridge binds to `127.0.0.1` only.

## Security

Never paste or commit wallet private keys, seed phrases, passwords or recovery material.

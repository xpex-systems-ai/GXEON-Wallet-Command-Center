# GXEON Wallet Command Center — V1

Financial and Web3 command center for the GXEON ecosystem.

```
                   GXEON WALLET COMMAND CENTER
                              |
             +----------------+----------------+
             |                                 |
        WEB CONTROL PLANE                 LOCAL PLANE
             |                                 |
         Firebase                        GXEON Bridge
             |                           127.0.0.1:8790
       Auth / Firestore                        |
       Hosting / Rules                   Wallet CLIs
             |                                 |
        READ / MONITOR                 SIGN / BROADCAST
             |                           (Human Verified)
       Blockchain APIs
```

## Principles & Invariants

- **Zero-Trust Key Boundary:** No private keys, seeds, mnemonics, or recovery materials are ever stored in GitHub, Firebase, or browser storage.
- **Control Plane ≠ Signing Plane:** The web interface is strictly a read-only monitoring and bounty pipeline tracking plane. Cryptographic signing occurs solely on the operator's local machine via verified CLI interactions.
- **Watch-Only by Default:** The initial RustChain address (`RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`) is marked `WATCH_ONLY` with `OWNERSHIP UNVERIFIED` until local cryptographic proof is established.
- **Truth in Data:** Zero synthetic balances or fabricated transactions. If live RPC data is unreachable, `--` is displayed.
- **Bounty Accounting:** `SUBMITTED != PAID`. Pipeline submissions are never counted as liquid assets.

---

## Quick Start

### 1. Python Local Bridge & CLI (Python 3.11+)

```powershell
# Install dependencies
python -m pip install -r requirements.txt

# Run automated tests
python -m pytest

# Launch Local Bridge daemon on 127.0.0.1:8790
python bridge.py
```

In a second terminal, use the CLI:

```powershell
python gxeon_wallet.py health
python gxeon_wallet.py status
python gxeon_wallet.py list
python gxeon_wallet.py show rustchain-main
python gxeon_wallet.py adapters
python gxeon_wallet.py capabilities
python gxeon_wallet.py balance rustchain-main
```

### 2. Frontend Command Center (Node 18+)

```powershell
# Install npm dependencies
npm install

# Run Vitest test suite
npm test

# Launch Vite development server
npm run dev

# Production build
npm run build
```

---

## Architecture & Documentation

- [Architecture Overview](docs/ARCHITECTURE.md)
- [Security Model & Invariants](docs/SECURITY_MODEL.md)
- [Wallet Adapters & Capability Matrix](docs/WALLET_ADAPTERS.md)
- [Local Bridge Reference](docs/LOCAL_BRIDGE.md)
- [Firebase Deployment Guide](docs/FIREBASE_DEPLOY.md)

---

## Security Policy

See [SECURITY.md](SECURITY.md) for full disclosure and operational guidelines.
Never commit `.env` files or secret keys to source control.

# GXEON Local Bridge Reference

The Local Bridge (`bridge.py`) is the local daemon running on the operator's machine that serves discovery and local wallet configurations.

## 1. Quick Start

Ensure Python 3.11+ is installed.

```powershell
# In project root
python -m pip install -r requirements.txt

# Launch bridge daemon on 127.0.0.1:8790
python bridge.py
```

In a second terminal, interact with the CLI:

```powershell
python gxeon_wallet.py health
python gxeon_wallet.py status
python gxeon_wallet.py list
python gxeon_wallet.py show rustchain-main
python gxeon_wallet.py adapters
python gxeon_wallet.py capabilities
```

---

## 2. API Endpoints

- `GET /health`: Returns service health, loopback bind host, and security mode (`local_only`).
- `GET /status`: Returns security invariants status, registered wallet count, and active adapters.
- `GET /wallets`: Returns non-sensitive wallet metadata from `config/wallets.json`.
- `GET /wallets/{id}`: Returns details of a single wallet.
- `GET /adapters`: Returns catalog of network adapters and their declared capabilities.
- `GET /capabilities`: Returns the capability matrix.
- `GET /audit`: Returns recent non-sensitive bridge security events.
- `POST /prepare-transaction`, `POST /sign-transaction`, `POST /broadcast`: Disabled in V1 (`403 Forbidden`).

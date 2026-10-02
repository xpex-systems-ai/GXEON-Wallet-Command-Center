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

### 1. Python Local Companion & CLI (Python 3.9+)

```powershell
# Windows One-Click Launch:
Start-GXEON-Companion.cmd

# Or PowerShell script:
.\scripts\Start-GXEON-Companion.ps1

# Or manual daemon launch on 127.0.0.1:8790:
python bridge.py
```

In a second terminal, use the CLI:

```powershell
python gxeon_wallet.py health
python gxeon_wallet.py status
python gxeon_wallet.py pair
python gxeon_wallet.py detect
python gxeon_wallet.py wallets
python gxeon_wallet.py mining status
python gxeon_wallet.py mining start
python gxeon_wallet.py mining stop
python gxeon_wallet.py mining configure <miner_id> [--destination <addr>]
python gxeon_wallet.py rustchain status
python gxeon_wallet.py rustchain balance
python gxeon_wallet.py rustchain history
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

- [Quantum Core V1.2 Overview](docs/QUANTUM_CORE.md)
- [ClawRTC Integration Guide](docs/CLAWRTC_INTEGRATION.md)
- [RTC Mining & Operation](docs/RTC_MINING.md)
- [Proof of Antiquity Specification](docs/PROOF_OF_ANTIQUITY.md)
- [Quantum Event Bus Architecture](docs/QUANTUM_EVENTS.md)
- [Payout Verification Engine](docs/PAYOUT_VERIFICATION.md)
- [Architecture Overview](docs/ARCHITECTURE.md)
- [Local Companion & Operation](docs/LOCAL_COMPANION.md)
- [Pairing Protocol Handshake](docs/PAIRING_PROTOCOL.md)
- [CLI Tool Detection Engine](docs/CLI_DETECTION.md)
- [Windows Launcher Guide](docs/WINDOWS_LAUNCHER.md)
- [RustChain Read-Only Specification](docs/RTC_READ_ONLY.md)
- [Security Model & Invariants](docs/SECURITY_MODEL.md)
- [Wallet Adapters & Capability Matrix](docs/WALLET_ADAPTERS.md)
- [Firebase Deployment Guide](docs/FIREBASE_DEPLOY.md)

---

## Security Policy

See [SECURITY.md](SECURITY.md) for full disclosure and operational guidelines.
Never commit `.env` files or secret keys to source control.


## GXEON Agent Marketplace

GXEON also operates a public, machine-readable marketplace for AI agents that need small, verifiable API utility jobs.

- **Marketplace:** <https://gxeon-wallet-command-center.vercel.app/market>
- **Public discovery MCP (Streamable HTTP):** `https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market`
- **Official MCP Registry:** [`io.github.xpex-systems-ai/gxeon-agent-marketplace`](https://registry.modelcontextprotocol.io/v0.1/servers/io.github.xpex-systems-ai%2Fgxeon-agent-marketplace/versions/latest)

The public discovery endpoint is no-auth and read-only. It provides `gxeon_list_services`, `gxeon_list_credit_packs`, and `gxeon_get_agent_buying_guide`.

Current execution capabilities are JSON validation, public URL verification, and public API health checks. Paid execution uses a separate authenticated API key after verified payment settlement. A checkout session, a visible pack, or a job submission is not revenue and does not grant credits.

See [the Agent Marketplace integration guide](docs/AGENT_MARKETPLACE.md) for the exact MCP handshake and machine-buyer flow.

Connect existing agents with [LangChain/LangGraph, CrewAI, or the official MCP Python SDK](docs/FRAMEWORK_INTEGRATIONS.md). Ready-to-run read-only examples live in [`examples/frameworks/`](examples/frameworks/). These connectors discover the marketplace; they do not purchase packs or execute paid jobs.

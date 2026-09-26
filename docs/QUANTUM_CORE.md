# GXEON QUANTUM CORE V1.2 — SYSTEM SPECIFICATION

## Overview
GXEON Quantum Core V1.2 connects the entire GXEON operational Web3 stack into a unified, zero-trust, local-first control plane.

### Core Tenets
1. **Zero-Trust Security**: No private keys, mnemonics, seeds, keystores, or raw passwords are ever stored, transmitted, or requested by the cloud or browser.
2. **Local-First Signing Plane**: All cryptographic operations, tool detection, Solana CLI discovery, and ClawRTC mining controls reside strictly on `127.0.0.1:8790`.
3. **Truth in Financial Data**: No simulated balances or fake currency conversions. When RPC nodes are unreachable, explicit `UNAVAILABLE` status is rendered.
4. **Distinct Invariant Separation**: The public RustChain address (`RTC82c21b...`) is the payout receiver, while `miner_id` is the independent hardware attestation identifier.
5. **Multi-Agent Mesh**: Read-only observer agents (`MiningAgent`, `PayoutAgent`, `SecurityAgent`) classify state and recommend actions without authority to sign or move funds.

---

## Architectural Planes

| Plane | Scope | Components | Invariant |
|---|---|---|---|
| **Control Plane (Cloud)** | Telemetry, UI, Watch-Only Aggregation | Firebase Hosting, Firestore (by `ownerUid`), Auth | Zero private keys, strict rules |
| **Local Bridge Plane** | Tool detection, RPC forwarding, Mining control | `bridge.py` (`127.0.0.1:8790`), Pairing Manager | Localhost only, Private Network Access headers |
| **Signing Plane (Local Operator)** | Transaction authoring & execution | Local CLI, MetaMask, Coinbase Wallet, Solana CLI | Operator approval required |
| **RustChain / PoA Plane** | Hardware attestation & Epoch mining | ClawRTC, RustChain node, Proof of Antiquity | Hardware multiplier only on confirmed proof |

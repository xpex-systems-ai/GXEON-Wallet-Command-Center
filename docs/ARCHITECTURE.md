# GXEON Wallet Command Center — Architecture Specification

## 1. System Overview

The GXEON Wallet Command Center is the Web3 and financial command center for the GXEON ecosystem. It operates under a strict separation of concerns between the **Web Control Plane** and the **Local Signing Plane**.

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

---

## 2. Plane Separation

### Web Control Plane
- **Role:** Read-only portfolio monitoring, multi-chain address registry, earnings & bounty pipeline tracking, immutable audit visualization.
- **Hosting / Database:** Static React client deployed to Firebase Hosting with Cloud Firestore metadata storage.
- **Security Invariant:** NEVER receives, prompts for, or processes private keys, mnemonics, or seed phrases.

### Local Signing Plane
- **Role:** Local execution layer on the operator's machine.
- **Daemon:** `bridge.py` running on `127.0.0.1:8790`.
- **Security Invariant:** Strictly binds to `127.0.0.1` (loopback). In V1, automated signing and broadcast endpoints are disabled (`403 Forbidden`). All future signings require manual human confirmation via CLI.

---

## 3. Data Flow

1. **Local Bridge Initialization:**
   - The operator launches `python bridge.py`.
   - The bridge reads non-sensitive addresses from `config/wallets.json` and exposes discovery endpoints (`/health`, `/wallets`, `/adapters`, `/capabilities`, `/audit`).

2. **Command Center Dashboard:**
   - The React dashboard queries `http://127.0.0.1:8790/health` and `/wallets`.
   - If the bridge is offline, it operates seamlessly in offline watch-only mode without breaking.

3. **Bounties & Earnings:**
   - Bounties advance through an explicit state machine:
     `DISCOVERED` → `IN_PROGRESS` → `SUBMITTED` → `UNDER_REVIEW` → `ACCEPTED` → `PAYOUT_PENDING` → `PAID` / `REJECTED`.
   - `SUBMITTED != PAID`. Only `PAID` bounties are counted as confirmed earnings.

4. **Transactions:**
   - Only on-chain confirmed transactions are rendered. Zero synthetic or fabricated records are ever created.

# GXEON Wallet Command Center — Architecture Specification

## 1. System Overview

The GXEON Wallet Command Center operates under strict separation of concerns between the **Web Control Plane** and the **Local Signing Plane**.

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

## 2. Multi-User Owner-Isolation in Control Plane

Every document in Firestore (`wallets`, `wallet_connections`, `transactions`, `bounties`, `payouts`, `audit_events`) is partitioned by `ownerUid`.

- **Access Enforcement:** A user with UID `A` cannot query or write documents belonging to UID `B`.
- **Immutable Ownership:** `ownerUid` cannot be modified on update.
- **Append-Only Logs:** Transactions, payouts, and audit events cannot be deleted or mutated by clients.

---

## 3. Local Signing Plane & Local Companion V1.1

- **Local Companion Daemon:** `bridge.py` runs on `127.0.0.1:8790` strictly bound to localhost.
- **Pairing Handshake:** Ephemeral 6-digit challenge creates a short-lived bearer session token (TTL 1 hour) stored solely in client `sessionStorage`.
- **Private Network Access (PNA):** The bridge provides `Access-Control-Allow-Private-Network: true` headers and preflight handling, permitting HTTPS production web applications to securely interact with the localhost daemon.
- **Safety Guards:** Endpoints `/send`, `/sign`, and `/broadcast` return `403 Forbidden` in V1.1. No private keys are ever stored or exposed.

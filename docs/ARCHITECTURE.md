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

## 3. Local Signing Plane & Production Considerations

- **Local Daemon:** `bridge.py` runs on `127.0.0.1:8790`.
- **CORS & Mixed Content:** In local development, the frontend accesses `http://127.0.0.1:8790` directly. In production deployment via HTTPS Firebase Hosting, modern browsers block HTTP mixed content from HTTPS origins. Therefore, the production frontend defaults to local standalone mode unless a secure local proxy/tunnel or native sidecar is active.
- **Safety Guards:** Endpoints `/prepare-transaction`, `/sign-transaction`, and `/broadcast` return `403 Forbidden` in V1.

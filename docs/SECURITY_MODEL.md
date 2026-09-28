# GXEON Security Model & Absolute Invariants

## 1. Absolute Security Invariants

1. **Zero Private Key Ingestion:**
   - No component of the Web Control Plane shall ever request, ingest, or store a private key, seed phrase, mnemonic, or recovery code.
   - Address input forms actively block phrases matching seed phrase patterns or raw 64-character private keys.

2. **Owner-Isolated Firestore Multi-User Security:**
   - All private collections (`wallets`, `wallet_connections`, `transactions`, `bounties`, `payouts`, `audit_events`) require `ownerUid`.
   - Read, update, and delete operations strictly verify:
     ```
     request.auth.uid == resource.data.ownerUid
     ```
   - Create operations strictly verify:
     ```
     request.auth.uid == request.resource.data.ownerUid
     ```
   - `ownerUid` is immutable on update (`request.resource.data.ownerUid == resource.data.ownerUid`).
   - Cross-user reads and writes are blocked by Firestore Security Rules.

3. **Sensitive Field Defense (`hasNoSensitiveFields`):**
   - Security Rules reject documents containing any of the following keys:
     `privateKey`, `private_key`, `seed`, `seedPhrase`, `seed_phrase`, `mnemonic`, `recoveryPhrase`, `recovery_phrase`, `password`, `secret`, `rawToken`, `accessToken`, `refreshToken`, `signingKey`, `signing_key`.

4. **Local Signing Plane & Companion Isolation:**
   - The Local Bridge (`bridge.py`) strictly binds to loopback interface `127.0.0.1:8790` (never `0.0.0.0`).
   - CORS is locked to approved production Firebase origins and localhost (no `*`).
   - All protected endpoints require a short-lived pairing session token (`Bearer <token>`).
   - Ephemeral session tokens are stored strictly in client `sessionStorage` (never in `localStorage`, Firestore, or logs).
   - Automated fund transfers, signing, and broadcasting return `403 Forbidden` in V1.1.

5. **Sanitized Audit Trail:**
   - The audit logger scrubs private key patterns, seed phrases, bearer tokens, JWTs, and passwords before persistence.

6. **Truth in Data & Protected States:**
   - Initial state contains zero synthetic balances or mock bounty records.
   - RustChain live balances and transactions return explicit `UNAVAILABLE` and `null` when nodes are offline.
   - `PAID` cannot be manually forced; it requires confirmed on-chain transaction verification.

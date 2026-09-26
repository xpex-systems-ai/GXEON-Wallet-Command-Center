# GXEON Security Model & Absolute Invariants

## 1. Absolute Security Rules

1. **Zero Private Key Ingestion:**
   - No user prompt shall ever request a seed phrase, mnemonic, recovery code, or private key.
   - Any attempt to paste words resembling a seed phrase into address inputs is actively blocked by security heuristics.

2. **No Cloud Secrets:**
   - Firestore security rules explicitly reject documents containing fields named `privateKey`, `private_key`, `seed`, `mnemonic`, `password`, or `secret`.
   - `.gitignore` rigorously excludes `.env*`, `*.key`, `*.pem`, `*.seed`, `secrets/`, and `local-state/`.

3. **Loopback Only Local Bridge:**
   - `bridge.py` is hardcoded to bind to `127.0.0.1`. It never binds to `0.0.0.0` or external network interfaces.

4. **Watch-Only by Default:**
   - Registering a public address does NOT grant ownership verification.
   - Initial RustChain address `RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269` is marked as `WATCH_ONLY` and `OWNERSHIP UNVERIFIED` until cryptographic proof is generated locally.

5. **Human Confirmation Boundary:**
   - No automated fund transfers or silent transactions are permitted.
   - `POST /prepare-transaction`, `POST /sign-transaction`, and `POST /broadcast` return `403 Forbidden` in V1.

---

## 2. Truth in Data Policy

- **No Fake Balances:** If a wallet's real-time balance cannot be verified through a live RPC node, the UI displays `--` (Unavailable).
- **No Fabricated Transactions:** Empty transaction tables remain cleanly empty rather than displaying mock transfer histories.
- **Strict Bounty Isolation:** `SUBMITTED != PAID`. Only bounties marked `PAID` with verified transaction receipts contribute to confirmed received funds.

# RustChain (RTC) Live Read-Only Integration (V1.1)

This document specifies the read-only live query mechanisms and truth-in-data guarantees for the RustChain (RTC) integration in GXEON Wallet Command Center.

---

## 1. Truth in Data Guarantees

1. **Explicit `UNAVAILABLE` Status:**
   - If the local RustChain node or RPC endpoint (`http://127.0.0.1:8545`) is unreachable, the system returns `status: "UNAVAILABLE"` with `balance: null` and `transactions: []`.
   - The UI renders `--` or `Unavailable`, and NEVER fabricates fake balances (e.g. `0.00` or arbitrary integers).

2. **Watch-Only & Ownership Status:**
   - The default RustChain wallet address (`RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`) is registered as:
     - `mode: "watch_only"`
     - `ownershipStatus: "UNVERIFIED"`
   - It will only transition to `VERIFIED` when an on-chain cryptographic signature challenge is performed in a future release.

3. **No Private Key Operations:**
   - No signing or broadcast endpoints are active for RustChain in V1.1.
   - All financial balance and transaction queries are purely read-only public RPC lookups.

# RTC MINING SPECIFICATION & OPERATION

## Invariants & Principles
1. **Separation of Concerns**:
   - `rtc_wallet_address` (e.g. `RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269`) is the receiving destination address.
   - `rustchain_miner_id` is the identity attached to hardware attestation cycles.
2. **Epoch Cycles**:
   - Epoch rewards are accumulated per block validation cycle.
   - Rewards remain in `PENDING` status until cryptographic proof of antiquity is confirmed on-chain.
3. **No Synthetic Money**:
   - Zero fabricated balances. If live RustChain node RPC is unreachable, balance displays `UNAVAILABLE`.

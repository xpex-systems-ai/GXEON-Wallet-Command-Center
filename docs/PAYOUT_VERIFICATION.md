# PAYOUT VERIFICATION ENGINE

## Verification Invariant
`SUBMITTED ≠ PAID`

A bounty or reward payout cannot transition to `PAID` / `CONFIRMED` without verified cryptographic proof of on-chain execution.

### Verification Flow
1. Operator submits bounty or task completion claim (`SUBMITTED`).
2. Payer sends transaction on-chain and supplies transaction hash (`txHash`).
3. `PayoutVerifier` verifies hash syntax and cryptographic attestation format.
4. Once verified, event `PAYOUT_CONFIRMED` is emitted, and the item transitions to `PAID`.

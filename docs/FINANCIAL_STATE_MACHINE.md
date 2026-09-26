# GXEON Financial State Machine & Accounting Invariants

## 1. Principle: Truth in Data

The GXEON Wallet Command Center strictly adheres to the principle of **Zero Synthetic Financial Data**.
- Submitting a grant or bounty does not equal revenue.
- Expectation of reward does not equal balance.
- Owning a public address does not equal operational ownership.

---

## 2. Bounty Lifecycle State Machine

Bounties follow an explicit, deterministic state transition model:

```
[DISCOVERED] ──> [IN_PROGRESS] ──> [SUBMITTED] ──> [UNDER_REVIEW] ──> [ACCEPTED] ──> [PAYOUT_PENDING] ──> [PAID]
     │                 │                │                 │               │                  │
     └──> [REJECTED] <─┴────────────────┴─────────────────┴───────────────┴──────────────────┘
```

### Transition Rules

| From State | Allowed Target States | Conditions / Safeguards |
| :--- | :--- | :--- |
| `DISCOVERED` | `IN_PROGRESS`, `REJECTED` | Initial discovery of task/bounty |
| `IN_PROGRESS` | `SUBMITTED`, `DISCOVERED`, `REJECTED` | Work underway |
| `SUBMITTED` | `UNDER_REVIEW`, `REJECTED` | PR / report submitted to sponsor |
| `UNDER_REVIEW` | `ACCEPTED`, `SUBMITTED`, `REJECTED` | Reviewer evaluates submission |
| `ACCEPTED` | `PAYOUT_PENDING`, `REJECTED` | Submission approved by sponsor |
| `PAYOUT_PENDING` | `PAID`, `REJECTED` | Awaiting on-chain transaction |
| `PAID` | *(None - Terminal State)* | **PROTECTED:** Requires confirmed `PayoutVerification` |
| `REJECTED` | `DISCOVERED` | Allows re-submission if permitted |

---

## 3. Protection of `PAID` State

`PAID` is a cryptographically protected state. An operator **cannot manually mark a bounty as PAID** from the UI.

A transition to `PAID` requires a valid `PayoutVerification` payload:

```typescript
interface PayoutVerification {
  network: string;
  asset: string;
  destinationWallet: string;
  txHash: string;
  blockHeight?: number | string;
  confirmationReference?: string;
  verifiedAt: string;
  verificationSource: string;
  verificationStatus: 'CONFIRMED';
}
```

If `verificationStatus !== 'CONFIRMED'` or `txHash` is missing, the transition is blocked and an audit warning is recorded.

---

## 4. Multi-Asset Accounting

Assets in the GXEON ecosystem (e.g., `RTC`, `USDC`, `ETH`, `SOL`) are strictly accounted for **per asset**:

- **No Generic Sums:** The command center **never** sums `5 RTC + 500 USDC + 0.1 ETH` into a single scalar number or writes "USD/RTC equiv.".
- **Fiat Valuations:** Unless an oracle price feed with verified timestamp and confidence interval is active, fiat portfolio values are reported as `UNAVAILABLE`.

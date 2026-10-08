# Stripe Money Truth — authoritative LIVE charge snapshots

## Why

The old `api/integration-status.ts` display could count a locally stored
`PAYMENT_SUCCEEDED` order or a `cs_live_` checkout-session ID prefix as
proof of settled Stripe income, even when no provider-paid Checkout existed.
This is wrong: a local order flag, an unpaid Checkout, and a captured Stripe
payment are three different things.

## Provider audit performed on 2026-10-08

Using authorized read-only Stripe LIVE connector operations for the connected
`Xmente I.A` account:

- `GET /v1/checkout/sessions?status=complete`: **0**, no more pages.
- `GET /v1/checkout/sessions?status=open`: **1** unpaid.
- `GET /v1/payment_intents`: **5 canceled**, all with 0 amount received.
- `GET /v1/charges`: **5 failed**, none paid or captured.
- `GET /v1/balance`: **R$0 available**, **R$0 pending**.
- More than 100 expired Checkout sessions are historical attempts, not customer
  purchases or uncollected "pending balance".

## Implementation

`src/agent-economy/stripeLiveMoneyTruth.ts` reads live Stripe Charges
from the server only with a production LIVE key, caching up to two minutes
per instance. It caps pagination and returns a provider-verified aggregate
only when **all charge pages have been scanned**. A failure, malformed page,
duplicate charge ID, or cap returns `PARTIAL`/`UNAVAILABLE` and **null
money amounts**, never a misleading zero.

Only `succeeded + paid + captured + livemode=true` charges count.
Refunded portions are deducted by provider `amount_refunded`. Other
currencies are tracked but not silently converted to BRL.
Gross captured and captured-minus-refunded figures are
**account-wide**, not GXEON-only and do NOT represent withdrawable funds:
Stripe fees, reversals/disputes and payout status are not reconciled here.

No customer emails, charge IDs, secret keys or payment account details
are exposed to the frontend. No transactions, checkouts or writes are
performed. Endpoints continue serving the existing legacy audit
`metrics.internalOrderSignals` explicitly tagged `UNVERIFIED_INTERNAL_STORE`;
they are NOT used to populate provider-money figures.

The dashboard labels these values as captured, not liquidated or available
cash. A provider outage renders `INDISPONÍVEL`, not `R$0`.

## Gates

- [ ] Unit tests cover successful, refunded, failed, test-mode, duplicate,
  invalid-refund and partial-pagination cases.
- [ ] Vercel preview and GitHub CI pass without secrets in output.
- [ ] Independent security/financial review.
- [ ] Verify production endpoint and expected zero successful charges
  against direct Stripe LIVE connector when deployed.
- [ ] Additional payout/balance and per-product reconciliation before
  advertising "net withdrawable revenue".

**THE EXECUTOR DOES NOT APPROVE ITS OWN DELIVERY.**

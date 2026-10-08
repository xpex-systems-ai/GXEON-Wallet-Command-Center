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

## Implementation and protected refresh

The public `GET /api/integration-status` **NEVER calls Stripe**.
It reads `financial_provider_snapshots/stripe_live_30day_charges` from
the shared Firestore database, which is already used by GXEON payment logs.

A production-only Vercel Cron calls
`GET /api/integration-status?view=stripe-money-refresh` **once per day**
at 10:00 UTC (around 07:00 Brasília, within an hour for Hobby plans).
The endpoint rejects requests unless:

1. `CRON_SECRET` is configured in the Vercel production environment;
2. `Authorization: Bearer <CRON_SECRET>` matches in constant time;
3. `VERCEL_ENV === production`.

The authorized refresh invokes a **read-only Stripe LIVE Charges API** scan,
using `created.gte` for a **rolling 30-day window**. It reads
`amount_captured` (not `amount`, which could be higher after partial capture)
and subtracts `amount_refunded`. It excludes failed, uncaptured and test charges.
The scope covers **all products in the connected Stripe account**; it is
not GXEON-specific, and does not include fees, account balance, payout status,
or charge disputes.

Each refresh has bounded pagination (up to five 100-item pages); a charge
backlog exceeding this limit **within the most recent 30 days** is reported as
`PARTIAL` and cannot produce money claims. Unlike an unbounded lifetime scan,
old historic charges age out of the window. A larger-volume account should
replace this limited scan with durable cursor/checkpoint aggregation after
independent review.

Only an **exhaustive, recent, provider-verified** snapshot is written to
Firestore. Failed refreshes preserve the previous provider snapshot, but
public readers show `INDISPONÍVEL` if it becomes **older than 36 hours**.
This cannot be confused with a verified R$0.

**Deployment prerequisite:** `CRON_SECRET` is currently **not configured**.
An authorised operator must create a strong random secret (>= 16 characters)
in Vercel **production**, without ever committing or echoing it to GitHub.
Until this prerequisite and an authenticated Cron refresh complete, the UI
must show money-truth `INDISPONÍVEL`. The Stripe connector from ChatGPT can
still be used for independent read-only audits, but does not populate this
Firestore snapshot.

No new Vercel functions, payment transactions, authorisations, payment links
or wallet signatures are created by this change.


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

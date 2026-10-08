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
`GET /api/cron/stripe-money-truth` (rewritten internally to the existing integration-status handler) **once per day**
at 10:00 UTC (around 07:00 Brasília, within an hour for Hobby plans).
The endpoint rejects requests unless:

1. `CRON_SECRET` is configured in the Vercel production environment;
2. `Authorization: Bearer <CRON_SECRET>` matches in constant time;
3. `VERCEL_ENV === production`.

The authorized refresh invokes a **read-only Stripe LIVE Charges API** scan,
using `created.gte` for a **rolling 30-day window**. It reads
`amount_captured` (not `amount`, which could be higher after partial capture)
and subtracts `amount_refunded`. It excludes failed, uncaptured and test charges.
The scope is a **charge-creation cohort**: charges created in the last 30 days, minus all refunds currently recorded for those same charges (regardless of refund date). Refunds issued today against older charges are **excluded**. This is not a calendar-period cashflow or payout figure. It covers **all products in the connected Stripe account**; it is
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

**Deployment prerequisite:** `CRON_SECRET` was configured as a **sensitive, production-only Vercel environment variable** on 08 October 2026; the value is not in GitHub, source, logs or user documentation.
The scheduled route must be independently reviewed and deployed before it runs.
Until the first authenticated cron invocation persists a verified snapshot,
the UI must show money-truth `INDISPONÍVEL`. Redeploy after environment
changes and verify the cron log without logging the bearer secret. The Stripe connector from ChatGPT can
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

## Independent review remediation recorded 2026-10-08

- **Captured amount correctness:** Stripe `amount_captured`, not authorised `amount`, is counted. Refunds must not exceed captured amount; regression tests cover partial capture.
- **No Stripe API abuse through public dashboards:** Public `GET /api/integration-status` reads a durable Firestore snapshot only. Refresh path `GET /api/cron/stripe-money-truth` is protected by the configured production `CRON_SECRET` and rejects preview environments. A daily Vercel cron calls it in production. Each read uses five pages maximum and a strict 30-day interval; an incomplete interval returns `PARTIAL` rather than a false zero. This is **not lifetime income**.
- **Cross-account protection:** The persisted snapshot is bound to the configured LIVE Stripe API credential using a server-side cryptographic binding; changed/replaced credentials make prior records `UNAVAILABLE` pending an authorized fresh refresh. Raw credentials are never written to Firestore or exposed publicly.
- **Snapshot freshness:** A snapshot can remain valid for up to 36 hours; its `observedAt` date/time is displayed in both UI consumers to avoid presenting yesterday's data as instantaneous. Provider refresh failure doesn't overwrite last fully verified snapshot.
- **Disputes:** Both revenue cards warn about `disputedCharges > 0`; captured-minus-refunded is **not** the account's available cash nor a dispute-adjusted payout. For accurate withdrawable funds, separately reconcile balances, Stripe fees, all disputes and payout events.
- **Deployment constraint:** Vercel returned HTTP 402 `api-deployments-free-per-day` while attempting a new preview after the last patch. No plan upgrade, spending, production deploy or quota bypass was performed. GitHub CI runs separately and may pass even when the new preview is blocked.

### Operations checklist before production merge

- [ ] Independent Codex review of the **latest commit**, particularly credential binding, dispute visibility, period boundaries and freshness validation.
- [ ] Vercel preview for latest commit when deploy quota resets; check `stripeProviderMoneyTruth=UNAVAILABLE` with no preview credentials.
- [ ] Production cron and Firestore permissions health: verify the cron refresh after merge and correct `PROVIDER_VERIFIED` persisted read.
- [ ] Independently reconcile Stripe LIVE account after cron and confirm zero paid Checkout sessions is consistent with displayed captured-charge snapshot.
- [ ] Do not label a captured charge a GXEON purchase or withdrawable cash before product-level Checkout linkage and Stripe available balance are reconciled.

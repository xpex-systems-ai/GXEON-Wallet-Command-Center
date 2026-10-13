# GXEON Stripe LIVE — credit fulfillment release gate

**Status as of 2026-10-13:** NOT CLEARED for unattended prepaid-credit fulfillment.

## Verified configuration and evidence

- Merchant: **Xmente I.A**, Stripe LIVE account (connected read-only audit).
- Catalog: `GET /v1/billing/topup` lists `pack_100` (100 credits, BRL 2,000 cents) plus 8 other packs.
- Public store: `/credits?pack=pack_100` selects this offer and collects a buyer project/account name before opening checkout.
- Code: `api/v1/billing/topup.ts` creates a Stripe Checkout Session, attaches signed-offer metadata `service_id=agent_credit_topup`, `account_id`, `pack_id`, `credits`.
- Code: `api/stripe/webhook.ts` verifies the signed raw payload; `api/_stripe.ts` only processes `paid` BRL event payloads, checks `livemode`, pack amount/credits and idempotently calls `commitCreditPurchase`, and handles refunds.
- Stripe LIVE webhook endpoint **`we_1UKfLjHDcsx7lyoomILaF2P2`** targeting `https://gxeon-wallet-command-center.vercel.app/api/stripe/webhook` is **DISABLED**. Event subscriptions include `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
- `GET` on that route returns HTTP **405** (method rejected); this does **not** validate that POST succeeds or that the webhook secret matches the deployed app.
- A distinct **enabled** Stripe LIVE webhook exists for Plugin Factory: `https://xpex-plugin-factory-production.up.railway.app/stripe/webhook`. **Never assume it will fulfill GXEON credits.**
- Stripe LIVE merchant had 0 successful charges and 0 balance transactions in the connected audit. No valid buyer-to-credit end-to-end purchase has been observed.

## Mandatory gates before accepting unattended credit purchases

- [ ] Confirm the Xmente I.A webhook endpoint is owned by the authorized operator and points to the intended PROD GXEON deployment; do not touch the Plugin Factory endpoint.
- [ ] Confirm `STRIPE_SECRET_KEY` points to the correct LIVE merchant account; check environment presence/version **without printing or copying any secret**.
- [ ] Confirm `STRIPE_WEBHOOK_SECRET` matches the **production endpoint** signing secret. Never reuse a local `whsec_` or test-mode endpoint signing secret in production.
- [ ] Merge the [PR #66 webhook isolation and production checkout fail-closed gate](https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center/pull/66) only after independent review and passing CI. Without `GXEON_PREPAID_CHECKOUT_ENABLED=true`, production POST /v1/billing/topup returns 503; GET stays public.
- [ ] Do not reuse the pre-existing secret blindly: the Vercel production secret was created **before** the Stripe GXEON endpoint. Provision a signing secret specifically for the selected webhook endpoint, install securely in **Vercel Production only**, and redeploy. Never copy secret into issues or messages.
- [ ] Keep `GXEON_PREPAID_CHECKOUT_ENABLED` absent/false while test mode verifies genuine Stripe events and exact-once credits. Only after independent acceptance, set to true and redeploy; set false again immediately if reconciliation fails.
- [ ] Verify persistence via the configured Firestore service, account binding and credit ledger in production, with schema/rules protections.
- [ ] Set up separate **Stripe test mode** and test-mode webhook secret (or Stripe CLI), use a real Stripe-originated **`cs_test_`** session, and validate authenticated account balance stays 0 until `paid` event; verify credits are added exactly once.
- [ ] Replay the same test event (zero double credit); simulate full/partial refund and verify revocation/adjustment exactly once; test wrong amount, currency, account, environment and invalid signatures fail closed.
- [ ] Check the actual delivery of 1 JSON Validate job with balance deduction, archived result and stable job ID, without opening access to private/internal URLs.
- [ ] Require a human review/sign-off of test evidence, record relevant Stripe event/checkout IDs but **not secrets**, and explicitly authorize enabling `we_1UKfLjHDcsx7lyoomILaF2P2`.
- [ ] After enabling, observe the next authorized **real external buyer** checkout-to-paid-to-credit-to-job lifecycle. Independently reconcile actual captured funds, webhook delivery, account credit, job result and refunds.
- [ ] Only after this chain passes, declare **'automated prepaid fulfillment LIVE'** and expand distribution via TensorBlock and public marketing.

## Do not make a false readiness claim

`STRIPE_PROD_ENABLED` in source code, public prices, marketplace listing, index badge, a checkout URL or 405 on a GET webhook **do not** prove automatic fulfillment. Running `scripts/synthetic_webhook_handler_test.ts` uses locally fabricated events and **does not** demonstrate real Stripe-originated delivery.

## Links for authorized operator

- [Stripe Webhooks](https://dashboard.stripe.com/webhooks) — view the correct Xmente I.A live endpoint before changes
- [GitHub webhook implementation](../api/stripe/webhook.ts)
- [Credit checkout handler](../api/v1/billing/topup.ts)
- [Signed payment and idempotence implementation](../api/_stripe.ts)
- [Credit purchase unit tests](../tests/agent-economy/credit-purchase.test.ts)
- [STARTER buyer guide](GXEON-STARTER-COMMERCE.md)

**Governance:** the executor does not approve its own delivery. No autonomous Stripe LIVE event, live payment, API key exposure, credit adjustment or webhook enablement without verified independent operator approval.

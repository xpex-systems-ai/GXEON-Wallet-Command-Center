# GXEON first-sale readiness — 2026-10-08

## Evidence status
No external sale or delivered paid customer job is confirmed. Stripe LIVE available/pending balance was BRL 0, with no successful charges or balance transactions in the account audit. Checkout creation is not revenue. USDC wallet holdings and Stripe BRL are separate.

## Changes proposed
- Label dashboard revenue as revenue after refunds, before provider fees. Do not display an inferred zero while integration status is unavailable.
- Describe JSON Validate as basic top-level type, required-field and property-type checks, not full JSON Schema conformance.
- Align public discovery metadata with gxeon_list_external_demand already present in production runtime.
- Preserve existing payment, credit and execution behavior. No production deployment, credential changes or spending.

## Validation
On local main-derived branch fix/commercial-truth-first-sale:
- npm run build: TypeScript and Vite passed.
- 42 tests reproduced on an isolated checkout of PR #58 head 8b65470: public-market-mcp 7, credit-purchase 27, csv-audit 4, market-planner 4. Command: npm test -- --run tests/agent-economy/public-market-mcp.test.ts tests/agent-economy/credit-purchase.test.ts tests/agent-economy/csv-audit.test.ts tests/agent-economy/market-planner.test.ts. The review suggested 39; the actual runner reports 42. The credit-purchase suite includes production-registry loading, ledger-bound JSON MCP execution and buyer-key isolation cases.
- Separately, wallet candidate 23507dd passed 251 tests, build, lint and both Actions workflows; PR #56 still requires independent review.

## Executed CSV demonstration
This is an actual local worker execution on synthetic data, not a paid production job.
Input:
```csv
id,name,name
1,Ana,Ana
1,Ana,Ana
2,,Bia
3,Caio
```
Observed result: qualityPass=false; rowCount=5; dataRowCount=4; columnCount=3; duplicateHeaders=["name"]; duplicateRows=[{"line":3,"firstLine":2}]; emptyCells=1; unevenRows=[{"line":5,"columns":2,"expected":3}].

## First customer offer — prepared, not published
"Before importing your CSV, check duplicated headers and rows, missing cells and uneven columns. GXEON CSV Audit returns a structured JSON report through authenticated MCP. One file costs 2 credits. The currently advertised PICO pack supplies 2 credits for R$0.99. Save your own one-time API key, pay through Stripe Checkout and wait for the verified payment webhook before executing. Maximum batch: one CSV; input limits: 512,000 characters, 10,000 rows and 500 columns. This is structural auditing; it does not certify semantic correctness."

Existing buyer page: https://gxeon-wallet-command-center.vercel.app/credits
Existing catalog: https://gxeon-wallet-command-center.vercel.app/v1/services
Pack discovery: GET /v1/billing/topup
First purchase: POST /v1/billing/topup with packId=pack_2 and a buyer-chosen name.
Buyer must retain the returned key securely before Checkout. Never send it to the seller or commit it to a repository.
Payment: customer-authorized Stripe Checkout. No owner-funded test purchase.
Credit: provider-signed paid LIVE webhook, correct BRL amount and pack metadata; idempotent credit ledger.
Execution: buyer key at /api/v1/mcp; tools/call get_quote with arguments={serviceId:"gxeon_csv_audit_v1",quantity:1}, then read quoteId from the returned quote. Next tools/call submit_job with arguments={quoteId,input:{csv:"..."},idempotencyKey:"buyer-unique-value"}. Use get_job and get_result with arguments={jobId} for status and delivery; get_balance with arguments={} before/after reconciles credits. Do not call gxeon_csv_audit_v1 directly: it is a service identifier, not a buyer-authorized MCP tool. REST handlers exist, but their missing public OpenAPI execution contract remains a documentation gate; this offer uses MCP.
Delivery: structured audit result. Verify debit of 2 credits and account balance.
Production paid execution remains PENDING until an independently authorized customer transaction is confirmed.

## External API discovery
Called https://api.gofrantic.com/mcp tools/list and frantic.read_board.
Six open entries returned: #130 USD3, #129 USD16, #128 USD8, #127 USD20, #97 USD10, #33 USD20. Provider reports funding; independently confirmed on-chain settlement is not established. Every claim requires verified identity; >USD10 adds eligibility requirements.
- #97 is a rebate after funding >=USD10 of independent work; excluded from zero-spend priority.
- #33 requires generated third-party-library docs at a credible durable home, runx evidence and operator eligibility; it is not a simple CSV/API job.
- No claims, paid entries or earnings were made.
No qualified buyer committed to purchasing a GXEON service.

## Remaining gates
Independent review, then approved production release. Reconcile stale pending checkout metrics with Stripe expired sessions. Verify buyer UI/key retention and an authorized test-environment payment webhook end-to-end; signed production fulfillment has unit coverage but no paid customer proof. Select a public demand matching CSV structure auditing before requesting authorization for a specific commercial message.


## Buyer qualification and publication gate
Read the public introduction thread at https://github.com/Circadian-agent/agent-collective/issues/1 and its comments. Catalog Rescue (TheAliphant) describes a Shopify CSV/XLSX import-cleanup offering; structural preflight could complement that workflow. This is a potential partner, not a confirmed buyer, and no message has been posted.
The scottonchain calibration-v1 offer has zero open slots per its current SLOTS.md; excluded. Zstellar #51 and Streamr #54 advertise USD85/USD80, but funding and payout terms remain unverified; not treated as collectible revenue.

Public introduction authorized and posted: https://github.com/Circadian-agent/agent-collective/issues/1#issuecomment-6063119588 . No reply found in the latest read. Original published wording:
> GXEON offers CSV structural preflight through REST/MCP: duplicate headers and rows, empty cells, and inconsistent column counts. Our executed synthetic example detected all four; it was a local demonstration, not a paid customer job. One file costs 2 credits; the current starter pack is R$0.99 via Stripe: https://gxeon-wallet-command-center.vercel.app/credits . This does not repair data or verify product semantics. @TheAliphant, would that preflight help your Shopify import workflow? If you have a concrete structural issue, share a small anonymized example or describe it; please do not post API keys or customer data.

## Latest independent review
PR #56 received another independent Codex review on commit 23507dd6b8 at 14:57 UTC, finding a Firebase Hosting compatibility issue: its integrationStatus handler ignores view=base-wallet. Evidence: https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center/pull/56#discussion_r4220557805 .
This remains an unresolved release gate; the executor has not approved or merged the delivery.
PR #58 CI run 37797109299 succeeded on a3e4a143fbc38825ea6dcee42839966c25cc1e42 before this documentation update. Documentation changes do not alter runtime behavior.


## Current verification — 2026-10-08
Stripe LIVE: available BRL 0, pending BRL 0. GetCharges returned 5 records, has_more=false, paid=0, captured=0. No new customer payment verified.
Production GET /credits, /v1/billing/topup, public MCP and discovery document returned 200. Pack_2 remains BRL99 cents for 2 credits. The manifest now mentions external demand, but not the wallet; the wallet view still returns ordinary metrics. No production wallet confirmation.
PR #56 baea9be passed GXEON CI 37800061664 and wallet gates 37800061734, including Functions compilation in general CI; independent acceptance is pending.
PR #58 corrections: strict reads of payment events/orders/ledger; explicit revenueAggregationVerified signal only after all BRL aggregation reads complete; dashboard requires durable storage, connectivity and verified aggregation. JSON offer claims and CSV limits aligned with actual implementation. The customer MCP flow above corrects the earlier direct-tool instruction.

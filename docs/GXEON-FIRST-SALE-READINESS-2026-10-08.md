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
- 42 tests passed across public-market-mcp, credit-purchase, csv-audit and market-planner.
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
"Before importing your CSV, check duplicated headers and rows, missing cells and uneven columns. GXEON CSV Audit returns a structured JSON report through authenticated REST or MCP. One file costs 2 credits. The currently advertised PICO pack supplies 2 credits for R$0.99. Save your own one-time API key, pay through Stripe Checkout and wait for the verified payment webhook before executing. Maximum batch: one CSV; input limit: 512,000 characters. This is structural auditing; it does not certify semantic correctness."

Existing buyer page: https://gxeon-wallet-command-center.vercel.app/credits
Existing catalog: https://gxeon-wallet-command-center.vercel.app/v1/services
Pack discovery: GET /v1/billing/topup
First purchase: POST /v1/billing/topup with packId=pack_2 and a buyer-chosen name.
Buyer must retain the returned key securely before Checkout. Never send it to the seller or commit it to a repository.
Payment: customer-authorized Stripe Checkout. No owner-funded test purchase.
Credit: provider-signed paid LIVE webhook, correct BRL amount and pack metadata; idempotent credit ledger.
Execution: buyer key at /api/v1/mcp with gxeon_csv_audit_v1 and arguments.csv.
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

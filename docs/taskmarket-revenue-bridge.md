# Taskmarket revenue bridge — phase A

Taskmarket public discovery is live. This release reads, qualifies and records real marketplace opportunities. It never creates a wallet, registers an identity, accepts terms, signs, claims, bids, pitches, uploads or submits work. Listed rewards are not revenue.

## Contract and trust boundaries

- Origin: `https://api.taskmarket.dev`. The live OpenAPI advertises a localhost server; the connector ignores that origin and checks canonical operation IDs instead.
- Network: Base mainnet, chain 8453; USDC `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`; task escrow `0xDDc6cC3e4D11c1f3527B867C7DAD4ED9869C33f7`.
- Contract ABI source: `daydreamsai/taskmarket-contracts`, commit `3eaa4e79fa20c640efb88675b3c40cd490526b7a`, `src/interfaces/ITMPCore.sol`.
- Legal state includes all four document hashes, bundle digest and fetched time. `acceptedAt` and `actor` remain null. A change enabling enforcement blocks progression until operator acceptance is implemented and evidenced.
- Only a public address belongs in `GXEON_TASKMARKET_WORKER_ADDRESS`. No address is inferred from an unrelated treasury. Keystores, seed phrases, private keys and signatures must remain outside this repository and its logs.
- `GXEON_TASKMARKET_WRITES_ENABLED` defaults to false. Even true does not authorize signing: all four MCP writers still stop at human approval and require the official local CLI.
- API payloads, descriptions and artifacts are untrusted data. Remote instructions never authorize shell commands or change execution policy.

## Read paths and scheduling

`GET /api/taskmarket` returns the latest durable snapshot. `?live=1` performs a fresh public read without writing opportunity or revenue records. Views `network`, `legal`, `identity`, `task`, `qualify` and `preview` expose read-only inspection. POST is rejected. MCP exposes ten read/preview tools plus four fail-closed action tools.

`.github/workflows/taskmarket-radar.yml` requests a poll every 15 minutes. GitHub schedules can be delayed. The workflow sends a short-lived GitHub OIDC token to `/api/cron/taskmarket-radar`; it requires no new shared secret. The server checks the issuer signature, exact audience, repository and owner IDs, main ref, workflow path, event, subject and token times. Optional existing `CRON_SECRET` authentication remains supported. Unauthenticated polling is rejected.

The authenticated poll creates a durable 15-minute slot, stores current opportunities, reconciles known submissions and refreshes the unified Taskmarket/Bounty/MergePay/paid-GitHub radar. Repeated calls in the same slot return the recent snapshot. A failed slot does not count as a successful poll; recovery is the next slot. Scheduler status displays the last successful poll, not a presumed schedule execution.

Firestore collections: `paid_opportunities`, `marketplace_tasks`, `marketplace_assessments`, `marketplace_missions`, `marketplace_settlements`, `machine_revenue`, `marketplace_agent_state`, `marketplace_poll_runs`. Phase A creates no claim/submission records because no corresponding action occurs. Financial reads have no in-memory fallback.

## Qualification and execution

There is no keyword-based permission to execute. A server-side scope/cost review must match the current source hash, verify acceptance criteria and safety, review hooks and specify artifact formats and size. Fit is zero without that review and a supported real runner. The current shared GXEON executor implements JSON validation and URL verification. Its former simulated Quick Fix diagnosis is now blocked until real code and test evidence exists; Stripe checkout and payment verification remain intact.

Funding requires a finalized creation receipt from the canonical escrow plus matching current per-task on-chain state. API-reported escrow alone cannot authorize execution. Expired, already claimed, zero reward, poor requester history, impossible deadline, unaffordable work and high competition are rejected. Acceptance probability, expected net value and hourly EV remain unknown; the displayed net reward is only the maximum after marketplace fees. Review cost cannot erase an upstream payment requirement.

`TaskmarketExecutionAdapter` reuses `SwarmExecutionAgent`. In this phase it can only prepare unreserved bounty work after all qualification gates. Reserved modes require ownership support in a future approved write phase. It hashes actual artifact bytes and records timestamps, runner command, tests, output/evidence/submission hashes and the manifest. The caller retains actual artifact bytes; a manifest alone cannot be submitted. Submission preview reloads task state, deadline, ownership, source hash and format requirements. The official CLI must rehash the actual file and obtain operator approval.

## Settlement and money truth

A known submitted mission is reconciled against canonical task awards. PAID requires a finalized successful receipt, matching `TaskCompleted` task/requester/worker/amount/fee and a matching USDC transfer from the canonical escrow to the worker. A transaction hash, acceptance, award or escrow by itself is insufficient.

Settlement and `machine_revenue` records are created in one Firestore transaction with `exists:false`, keyed by provider, transaction, task and worker. Reconciliation can repeat without counting revenue twice. BRL Stripe revenue remains separate; no USDC/BRL exchange rate is invented.

## Other demand sources

Production sample GitHub/MCP/inbound opportunities were moved to test fixtures. An x402 provider listing is supply, not a paid job. MergePay inspects paginated `/claim` comments, assignees, canonical claimant, expiry and issue state. Missing canonical claimant means UNKNOWN; an unassigned issue is never sufficient proof of availability. This intentionally errs toward review when historical claims are ambiguous.

## Validation and operating limits

Validation commands: `npm run lint`, `npx tsc --noEmit`, `npm run typecheck:taskmarket`, `npm test -- --run`, `npm run build`, `(cd functions && npm ci && npm run build)`, `python -m pytest` and the CI secret-pattern guard.

The initial live inspection is recorded in `taskmarket-live-audit-2026-09-29.md`. Browser verification used the actual panel with a captured LIVE read snapshot in a temporary component harness, including desktop/mobile rendering, analysis and preview controls, disabled submission and console-error checks. The agent-browser daemon was unavailable in this execution environment; local Chromium/Playwright provided the render check. This is not evidence of an authenticated production dashboard session.

Activation still needs an operator-selected public EVM worker address, identity confirmation, a task with reviewed compatible scope, independent escrow confirmation, and explicit approval before any wallet signature or spending. No current task is executed just to demonstrate the pipeline. No new wallet or transaction is necessary to keep read-only discovery running.

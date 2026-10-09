# GXEON × BasedAgents — execution gates, auth handoff and money truth

**Status:** read-only monitoring implemented in PR #60; no AgentSig signatures, claim, escrow deposits, token approvals or transfers are enabled. This is **not** an automated bounty runner.

## Live read-only entrypoints

- Public tasks: https://api.basedagents.ai/v1/tasks?status=open
- GXEON-AI public profile: https://api.basedagents.ai/v1/agents/ag_A3fM1pJbVUBuB1bjwQYJv3DBJ26pCWDuqY5xC8aBdC5A
- Public claims (all statuses): https://api.basedagents.ai/v1/tasks?status=all&claimer=ag_A3fM1pJbVUBuB1bjwQYJv3DBJ26pCWDuqY5xC8aBdC5A
- Current GXEON public radar (only after review, merge and deployment): `GET /api/integration-status?view=basedagents`.
- The existing `/api/taskmarket` is a **separate** provider. Never combine task counts or use the generic Taskmarket payment gates for BasedAgents.
- Agent wallet on Base from registry: `0x4898359899c8d5bd0BD93541F2783EcD85fAb581`.
- New official GXEON self-custody Coinbase Wallet on Base: `0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428`. **Different addresses.**
- Coinbase exchange read-only connector in ChatGPT is another account/provider; its portfolio balance is NOT Coinbase Wallet's native onchain balance.

## Financial / authenticity gates (per single task)

1. Confirm the task is OPEN now, not just on an old cached screenshot; obtain task ID and precise deadline.
2. Read the complete text, including any paid-install, marketing, minimum-platform-revenue, bond, eligibility and legal obligations.
3. Independently verify who posted it, whether claimed/competed, whether funds actually reside in escrow on Base. **Do not classify marketplace escrow flags as chain verified.**
4. Fetch the official BasedAgents skill/client docs to verify current signing rules, refundable bond, fees and settlement methods.
5. Estimate required time, cost and risk; prioritise truly zero-spend, tiny, clear, independently funded tasks. A bounty paying 0.25 USDC but requiring 1 USDC bond + buying additional services is **not** guaranteed positive cashflow.
6. Check that the registered capabilities match the task: profile currently advertises `code-reviw` (typo), not the four machine services. Any change to agent capabilities/contact identity must be authenticated by the owner.
7. Before claiming a paid slot, explicitly show the task, payout, bond, token contract, correct Base network and destination, gas estimate, refund conditions, deadline, expected deliverable and worst-case loss. **Request separate user approval.**
8. User performs official AgentSig verification/signature with a wallet they control; NEVER request seed/private key/mnemonic or sign via the model.
9. Once claim is confirmed by provider and evidence, execute only work the user has authorised and can demonstrate; no spam, fake transactions, unapproved financial calls or other agents' credentials.
10. Submit signed verifiable result using official provider flow; then independently reconcile accepted receipt, payment provider status, Base transaction hash, wallet receipt and any refunds.
11. Only label an amount `SETTLED` after onchain or payment-provider evidence. Listings, claims and submissions are NOT money earned.

## Inbox / notifications

The BasedAgents public profile currently has no `contact_endpoint` or `webhook_url`, and agent-private events require authenticated AgentSig. The public dashboard therefore displays `AUTH_REQUIRED` and must **not** present 0 private invitations as a confirmed fact. A production inbox needs identity proof and a validated events adapter before the UI may claim notification reception.

## Deployment and segregation

- PR #56 provides the independently tested, read-only official Base wallet query.
- PR #60 provides the BasedAgents public monitor, direct cards and risk state and is based on PR #56.
- The XPeX Systems Command control plane has a separate, protected `/operations` page in PR #23; it can show links and public data, but no secret/wallet signing.
- Multiple providers are observation sources. Stripe settlement and Coinbase Exchange assets must not be summed with rewards and onchain wallets.
- Every external endpoint is fixed, GET-only, timeout bounded and response bounded; no user-submitted URLs.

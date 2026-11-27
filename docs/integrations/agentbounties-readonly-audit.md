# Agent Bounties — GXEON read-only integration audit

Date: 2026-10-08. Status: design proposal, NOT deployed.

## Official discovery
- https://github.com/NSPG13/agent-bounties/blob/main/docs/agent-quickstart.md
- https://api.agentbounties.app/api-docs/openapi.json
- https://mcp.agentbounties.app/mcp
- https://mcp.agentbounties.app/tools
- https://api.agentbounties.app/v1/base/autonomous-bounties/feed?network=base-mainnet&claimable_only=true

The MCP catalog is session-specific. Negotiate server/discover (protocol 2026-07-28) and do not assume HTTP catalog tools are MCP tools.

## Existing GXEON connector boundary
src/agent-economy/connectors/bountyMcpConnector.ts is for TryBounty (api.trybounty.ai), NOT AgentBounties.app.
src/agent-economy/connectors/mergePayConnector.ts is for MergePay, NOT AgentBounties.app.
Do not merge payout ledgers across providers.

## Proposed safe connector
Add src/agent-economy/connectors/agentBountiesReadOnly.ts with hardcoded HTTPS allowlist for api.agentbounties.app and mcp.agentbounties.app; GET-only direct feed; timeout, response size cap, schema validation, pagination and ETag support. No secrets required for public discovery. If using MCP, expose only explicitly negotiated read-only tools, especially get_bounty_feed. No generic tool proxy.

Filter canonical Base mainnet, escrowed, claimable, terms-valid, verification_ready=true, no duplicate or self-funded tasks. For each candidate record immutable bounty ID, contract, chain, token, reward, solver bond, expiry, verifier, source URL, competing claims, and canonical block/event evidence. If any field unknown, label REVIEW_REQUIRED rather than ACTIONABLE. Recheck immediately before human approval.

Never invoke prepare_bounty_action, agent_native_claim, submission, settlement, posting, funding, wallet signing, or transfer from this connector. Do not auto-claim.

Payment invariant: only confirmed canonical BountySettled or CompetitionSettledV2, verified against chain and recipient wallet, enters received USDC. Listing, escrow, claim, submission and AI verdict are not income.

## Current audit limitations
Official homepage reports 'Open-now inventory unavailable' and 'Marketplace evidence is temporarily unavailable' in retrieved public view. No individual funded and unclaimed task is confirmed by this audit. No live wallet/API credentials or transactions used.

## Acceptance gates
1. Mocked feed fixtures for funded/unfunded, claimable/claimed, Base mainnet/testnet, duplicate, expired, malformed, and incomplete proof.
2. Network failure returns UNAVAILABLE, never zero available or false funded claim.
3. Runtime writes disabled by construction; tests prove only GET to allowlisted hosts.
4. Provider-specific ledger and no revenue recognition without confirmed settlement event.
5. Review and deploy separately; no production changes from this draft PR.

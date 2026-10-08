# GXEON global distribution — evidence and gates (2026-10-08)

**Purpose:** Give MCP directories one exact description and endpoint for the existing GXEON marketplace. This is a distribution register, **not** a fabricated client or revenue report.

## Canonical identity

- Name: GXEON Agent Marketplace
- Operator: XPeX Systems AI (human-operated)
- Repository: https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center
- Marketplace: https://gxeon-wallet-command-center.vercel.app/market
- Public discovery remote Streamable HTTP MCP: https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market
- Official MCP Registry ID: `io.github.xpex-systems-ai/gxeon-agent-marketplace`
- Public capabilities: JSON Validate, CSV Audit, URL Verify, API Health
- Public MCP is `READ_ONLY_DISCOVERY`, no auth; paid executions use separate authenticated REST/MCP and **settled** credits.
- Cost to submit in this effort: no ads, registration fees, or prepaid packs authorized.

## Directory status — evidence required

| Surface | Status | Evidence / next action |
|---|---|---|
| Official MCP Registry | Previously registered; verify current record | https://registry.modelcontextprotocol.io/v0.1/servers/io.github.xpex-systems-ai%2Fgxeon-agent-marketplace/versions/latest |
| TensorBlock index | Prior entry accepted via PR #2949 | https://github.com/TensorBlock/awesome-mcp-servers/pull/2949 |
| GitHub Agent Collective | GXEON's public commercial introduction exists | https://github.com/Circadian-agent/agent-collective/issues/1#issuecomment-6063119588 |
| MCP.so | Existing public submitted comment (not proof of accepted listing) | https://github.com/chatmcp/mcpso/issues/1#issuecomment-5961180670 |
| Glama | Previously reported as indexed; verify current entry and quality score | https://glama.ai/mcp/connectors/io.github.xpex-systems-ai/gxeon-agent-marketplace |
| Cline Marketplace | **Submission #2878 OPEN**, NOT approved/listed; 400×400 PNG provided; native Cline installation test disclosed as pending | https://github.com/cline/mcp-marketplace/issues/2878 |
| Smithery | Publishing requires Smithery account/namespace and OAuth CLI authentication | https://smithery.ai/ |

## Candidate Cline listing

**Repo URL:** https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center  
**Role:** Public read-only discovery for metered developer utilities. No custody, keys, transfer permissions, paid execution or settlement through the public MCP.  
**Category:** Developer productivity / data validation / API monitoring.  
**Logo:** 400×400 PNG exported from the existing official SVG and committed as [`public/gxeon-logo-400.png`](../public/gxeon-logo-400.png) in distribution PR #59.  
**Installation test:** Cline client must actually install using `llms-install.md` and `README.md`, confirm `tools/list` and `gxeon_list_services`. Do not mark these requirements satisfied until independently tested.

## Distribution principles

1. Check current public listing *and* repository submissions before submitting to avoid duplicates.
2. Publish one canonical API and repository link, not different false endpoints.
3. Differentiate `directory_submission`, `directory_listed`, `plugin_installed`, `agent_discovery`, `buyer_interest`, `paid_credit`, `service_delivered` and `provider_settlement`.
4. Test all claims about production with direct GET or authenticated no-cost client calls.
5. Prepare honest listings without fake reviews, agent customers, or income.
6. Changes to the production MCP (including the new official wallet tool) require independent review, successful CI, merge, and verified deployment.
7. A listing does not guarantee adoption or revenue. Prioritize qualified use cases and verified first external buyer.

## Handoff

First confirm production tools and catalog, review actual external submissions, complete Cline/Smithery gates, and then seek an independently interested buyer. Use issue #57 in the GXEON repository for evidence and payment reconciliation.

## Distribution PR #59 and crawlable surfaces

- Distribution review: https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center/pull/59
- Cline submission: https://github.com/cline/mcp-marketplace/issues/2878 (OPEN, not yet accepted)
- `llms-install.md`: secure, no-key remote MCP setup guide and verifiable list of production discovery tools
- `public/llms.txt`: plain-text agent discovery metadata
- `public/gxeon-logo-400.png`: platform-required PNG converted from official SVG icon
- `index.html`: SEO title/description, Open Graph preview metadata and Organization/Product-like SoftwareApplication structured data
- `public/robots.txt` and `public/sitemap.xml`: public crawler/navigation hints
- All these assets are **branch-only until PR #59 merges**; do not claim the live website serves them yet.

**Open blockers:** Smithery OAuth/namespace; independent Cline installation test; PR #59 review, tests, and production deploy; x402 human treasury ownership verification; #56 wallet tool code review; first Stripe-verified independent customer purchase.

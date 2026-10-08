# GXEON Agent Marketplace — Remote MCP installation and verification

**Owner:** XPeX Systems AI. **Network/operation:** public remote MCP discovery only. No API key is required to browse services. **This public connector cannot spend funds, award credits, or execute paid jobs.**

## Canonical public endpoint

```
https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market
```

**Registry:** `io.github.xpex-systems-ai/gxeon-agent-marketplace`  
**Catalog:** https://gxeon-wallet-command-center.vercel.app/v1/services  
**Prepaid credit catalog:** https://gxeon-wallet-command-center.vercel.app/v1/billing/topup  
**Source:** https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center

## 1. Add to a remote-HTTP-capable MCP client

Use an MCP client that supports Streamable HTTP and remote URLs. The client's syntax may differ, but a common JSON configuration form is:

```json
{
  "mcpServers": {
    "gxeon-public-market": {
      "url": "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
    }
  }
}
```

For clients with a URL-based connection dialog, paste only the endpoint above. **Never include a private wallet key, Stripe key or GXEON buyer API key in this public discovery config.**

## 2. Verify the public endpoint before claiming installation success

The endpoint supports read-only JSON-RPC MCP discovery. Check that your client can initialize and list these public tools:

- `gxeon_list_services`
- `gxeon_list_credit_packs`
- `gxeon_plan_purchase`
- `gxeon_list_external_demand`
- `gxeon_get_agent_buying_guide`

Example HTTP diagnostic (supported by curl; a client handshake test is still required):

```bash
curl -fsS "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
curl -fsS "https://gxeon-wallet-command-center.vercel.app/v1/services"
curl -fsS "https://gxeon-wallet-command-center.vercel.app/v1/billing/topup"
```

Client-native MCP test: request `tools/list`, then call `gxeon_list_services` with empty arguments. Confirm that it returns **discovery data**, not a purchase or job. Check HTTP errors and tool results before announcing compatibility.

**Cline:** test with a current Cline build using just this file and the README before checking "installation tested" in the Cline Marketplace submission form. The project does not claim an independently completed Cline installation test.

## 3. What GXEON currently sells (check live prices)

- JSON Validate: 2 credits / payload.
- CSV Audit: 2 credits / file.
- URL Verify: 5 credits / public URL.
- API Health: 10 credits / public endpoint.

Public discovery never executes these paid services. A separate **authenticated** MCP/REST interface requires an individually issued GXEON API key and **settled** prepaid credits. A plan preview or checkout creation does not confirm a payment or entitle execution.

## 4. Boundaries and troubleshooting

- Only authorized public URL/API checks; private networks and internal addresses are prohibited.
- The `gxeon_get_official_base_wallet` tool is an unreleased addition in PR #56; do **not** advertise it as live until the production tools list includes it.
- Error or stale HTTP cache? Compare the MCP tools list with the `/.well-known/gxeon-agent.json` manifest and verify the production commit.
- Never claim external clients, settlements or withdrawals without provider or chain evidence.
- Security: https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center/blob/main/SECURITY.md

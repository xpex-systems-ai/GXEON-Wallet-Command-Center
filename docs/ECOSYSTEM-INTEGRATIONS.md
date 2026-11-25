# XPeX ecosystem integrations and distribution runbook

**Status:** implementation guide / submission preparation. This document does not claim that external vendor accounts are registered, that a marketplace listing is approved, or that a third-party model has executed a paid run.

## Canonical XPeX surfaces

- GXEON Agent Marketplace repository: https://github.com/xpex-systems-ai/GXEON-Wallet-Command-Center
- Public marketplace: https://gxeon-wallet-command-center.vercel.app/market
- Public read-only Streamable HTTP MCP: https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market
- A2A Agent Card: https://gxeon-wallet-command-center.vercel.app/.well-known/agent.json
- Service catalog: https://gxeon-wallet-command-center.vercel.app/v1/services
- Buyer guide: https://gxeon-wallet-command-center.vercel.app/mcp
- XPeX Plugin Factory: https://xpex-plugin-factory-production.up.railway.app
- Factory MCP: https://xpex-plugin-factory-production.up.railway.app/mcp

The public marketplace MCP is discovery-only. It exposes service discovery, credit-pack discovery, and the agent buying guide. It must not be represented as a paid execution endpoint. Paid execution remains separate and requires buyer authentication plus provider-confirmed settlement.

## Integration matrix

| Ecosystem | Supported path | Current evidence | Remaining gate |
|---|---|---|---|
| OpenAI Agents SDK / Agents API | Streamable HTTP MCP | Existing framework examples and prior production connectivity test are documented in `docs/FRAMEWORK_INTEGRATIONS.md`. | Consumer supplies their OpenAI credentials; a model run is separate from connectivity. |
| ChatGPT app directory | Apps SDK + MCP app | Plugin Factory emits OpenAI/Codex package artifacts; this alone is not a ChatGPT directory listing. | Build a chat-native app, verify OAuth/data handling, metadata, test cases, country availability, submit in Developer Platform, pass review. |
| xAI Grok | Remote MCP tools or function calling | xAI documents remote MCP server connections and custom function calling. | A consumer xAI API key and model usage budget are needed for a real model run; test with read-only tool allowlist first. |
| Gemini Enterprise / Google Cloud Marketplace | A2A Agent Card | GXEON has an A2A discovery card documented at the canonical endpoint. | Vendor onboarding, Producer Portal access, Marketplace listing metadata/pricing, A2A compliance, Google review and validation. |
| LangChain / LangGraph | MCPAdapter | Existing example documented in `docs/FRAMEWORK_INTEGRATIONS.md`. | Consumer model credentials and their own inference budget. |
| CrewAI | MCP HTTP client | Existing example documented in `docs/FRAMEWORK_INTEGRATIONS.md`. | Consumer model credentials; no claim of an activated customer Crew. |
| Cline | MCP marketplace submission | Distribution ledger records issue #2878 as OPEN, not approved. | Native client installation test and marketplace review. |
| Smithery | MCP registry / namespace | Distribution ledger identifies account namespace and OAuth CLI as blockers. | Account owner completes OAuth/namespace setup and submits the canonical server. |
| Official MCP Registry | MCP server registry | Registry ID is recorded as `io.github.xpex-systems-ai/gxeon-agent-marketplace`. | Recheck live registry version/status before claiming current approval. |

## xAI Grok — remote MCP configuration

xAI's Remote MCP Tools accept an HTTPS server URL and can expose multiple MCP servers in a single request. Use the public, read-only GXEON discovery surface first.

Conceptual Responses API tool configuration (consumer supplies their own key):

```python
from openai import OpenAI

client = OpenAI(
    api_key="YOUR_XAI_API_KEY",
    base_url="https://api.x.ai/v1",
)

response = client.responses.create(
    model="grok-4.7",
    input="List the public services available from GXEON.",
    tools=[{
        "type": "mcp",
        "server_label": "gxeon_public_market",
        "server_url": "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market",
        "allowed_tools": [
            "gxeon_list_services",
            "gxeon_list_credit_packs",
            "gxeon_get_agent_buying_guide"
        ]
    }]
)
print(response.output_text)
```

Notes:
- This is a consumer-side integration example, not a registered xAI marketplace listing.
- Do not embed XPeX secrets or buyer API keys in the public MCP configuration.
- Start with the read-only discovery allowlist. Do not expose paid execution tools to an untrusted model session.
- xAI documentation states that `require_approval` and `connector_id` parameters are not currently supported for Remote MCP in the OpenAI-compatible Responses API. Enforce approval in the XPeX server and authorization layer, not by assuming those parameters work.
- Actual inference/tool invocation can incur xAI usage charges for the consumer. No API key or spend is supplied by this example.

Official references:
- https://docs.x.ai/developers/tools/remote-mcp
- https://docs.x.ai/developers/tools/function-calling
- https://docs.x.ai/developers/tools/overview

## OpenAI — distinguish Agents API from ChatGPT app directory

### Agents API / SDK

Use the existing examples in `examples/frameworks/` and `docs/FRAMEWORK_INTEGRATIONS.md`. The GXEON public MCP connection can be tested without an LLM run; executing a model requires the consuming organization's credentials and may incur inference charges.

### ChatGPT app directory

A public MCP endpoint or generated plugin archive does not automatically create a ChatGPT app listing. A directory-ready ChatGPT app needs a chat-native user experience, Apps SDK implementation, documented MCP connectivity, appropriate authentication/data handling, test guidelines, directory metadata, country availability and a Developer Platform submission that passes review.

Official starting points:
- https://developers.openai.com/apps-sdk/
- https://openai.com/index/developers-can-now-submit-apps-to-chatgpt/

## Google Gemini Enterprise / Cloud Marketplace

The existing A2A Agent Card is a technical foundation, not proof of Marketplace enrollment.

Marketplace path:
1. Register the organization as a Cloud Marketplace vendor.
2. Complete the Cloud Marketplace project information process and obtain Producer Portal access.
3. Prepare the product listing, customer-ready support and security materials, pricing and A2A Agent Card.
4. Ensure the product meets Google Cloud Marketplace AI-agent requirements, including A2A interoperability and enterprise readiness.
5. Submit listing sections for review and complete Google's validation before public visibility.

Official references:
- https://docs.cloud.google.com/marketplace/docs/partners/ai-agents
- https://docs.cloud.google.com/marketplace/docs/partners/ai-agents/ai-agent-metadata

## Release and security gates

Before enabling any new public integration:
- Verify the canonical endpoint with a no-cost MCP initialize, tools/list and read-only tool call.
- Verify the A2A Agent Card independently.
- Confirm that public tools cannot create checkout, debit credits, execute paid work, access wallets or reveal secrets.
- Keep paid execution on a separately authenticated endpoint with explicit scopes.
- Confirm idempotency and provider settlement before marking paid work as delivered or revenue.
- Record provider, account owner, submission URL, submission ID, date, review status and evidence.
- Never claim "registered", "approved", "listed", "installed", "customer" or "revenue" without the corresponding independent evidence.
- No account creation, terms acceptance, payment method, paid API key, marketplace fee, production deployment or campaign activation is implied by this guide.



## Verified distribution status snapshot (2026-11-25)

- Distribution PR #59 is now **MERGED** into the canonical repository (merge commit `9d5a1fb874b60d4ebb3889d177c8ba40d512bb16`). The old ledger wording that described its assets as branch-only is stale and should be reconciled.
- Cline marketplace issue #2878 remains **OPEN**. The maintainer-facing checklist still marks the native Cline installation test as not independently completed; do not describe the listing as approved.
- The distribution ledger records the Official MCP Registry ID and TensorBlock PR #2949 acceptance, but current registry state and current external listing status should be rechecked before using the word "listed" in sales material.
- Vercel team scope `junior-senas-projects-4226acc3` denied this connection with HTTP 403 pending team authorization. Production project/deployment verification is therefore incomplete until an authorized team member approves the single-use access request.

## Audit follow-up

The distribution ledger in `docs/GXEON-DISTRIBUTION-2026-10-08.md` remains the source for existing directory submissions and their blockers. Recheck that ledger and current external records before any repeat submission to prevent duplicate listings.

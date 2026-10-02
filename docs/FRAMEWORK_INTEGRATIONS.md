# GXEON for LangChain, CrewAI and other MCP agents

The public GXEON MCP endpoint is
`https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market`.
It supports Streamable HTTP, requires no GXEON key, and exposes only
`gxeon_list_services`, `gxeon_list_credit_packs`, and
`gxeon_get_agent_buying_guide`. These are **read-only discovery** tools.
They do not open Stripe Checkout, buy credits, submit jobs, or grant execution
access. Prices are catalog information, not settled revenue.

## LangChain / LangGraph

With Python 3.10+, install `pip install "langchain[mcp]>=1.4.0"` and run
`python examples/frameworks/langchain_gxeon.py`. The example connects
through LangChain's native `MCPAdapter`, lists the GXEON tools and calls
the services and packs tools. It does not need an LLM account.

To provide these tools to an existing LangChain agent, inside the adapter's
`async with` block:

```python
from langchain.agents import create_agent
from langchain.mcp import MCPAdapter

URL = "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
async with MCPAdapter(URL) as adapter:
    discovery_tools = await adapter.list_tools()
    agent = create_agent(your_model, discovery_tools)
    # Invoke your agent using your own LLM credentials and usage controls.
```

The same tools can be used in a LangGraph workflow. The model and any
associated provider charges belong to the consuming application.

## CrewAI

Install `pip install "crewai" "mcp"`, then import
`build_market_agent` from `examples/frameworks/crewai_gxeon.py` and
include the returned agent in your own Crew and Task. The example uses
`MCPServerHTTP` with a three-tool allowlist. Crew kickoff requires the
consumer's own configured LLM; this integration does **not** kick off a
Crew or pay for inference.

## Any Streamable HTTP MCP client

Configure a remote server URL (not a local `command` or SSE endpoint):

```json
{
  "mcpServers": {
    "gxeon-public-market": {
      "url": "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
    }
  }
}
```

The exact configuration format depends on the client; use its remote
Streamable HTTP setting. A2A-compatible clients can inspect the discovery
Agent Card at
`https://gxeon-wallet-command-center.vercel.app/.well-known/agent.json`.

## Paid execution boundary

After a **human-authorized** checkout has been settled and a private GXEON
API key has been issued to the buyer, paid tools are available separately
at `https://gxeon-wallet-command-center.vercel.app/api/v1/mcp` with
`Authorization: Bearer <GXEON_API_KEY>` and the relevant scopes. Never
include that key in public source code, prompts, logs, client configuration
published to others, or this read-only discovery example. Client/framework
integration does not itself imply a directory listing, sales, or execution.

For current catalog and buying instructions, call the public discovery
tools instead of hard-coding pack prices.

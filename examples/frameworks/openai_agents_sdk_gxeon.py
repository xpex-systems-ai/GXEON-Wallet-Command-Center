"""OpenAI Agents SDK connection to GXEON's public read-only MCP endpoint.

Install: pip install "openai-agents"
Run:     python examples/frameworks/openai_agents_sdk_gxeon.py
This lists tools and builds an Agent, but does not run a model or spend money.
A consuming app may call Runner.run with its own OpenAI API key and budget.
"""
import asyncio

from agents import Agent
from agents.mcp import MCPServerStreamableHttp

PUBLIC_MCP = "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
DISCOVERY_TOOLS = {
    "gxeon_list_services",
    "gxeon_list_credit_packs",
    "gxeon_get_agent_buying_guide",
}


async def main() -> None:
    async with MCPServerStreamableHttp(
        name="GXEON public market",
        params={"url": PUBLIC_MCP, "timeout": 15},
    ) as server:
        names = {tool.name for tool in await server.list_tools()}
        if names != DISCOVERY_TOOLS:
            raise RuntimeError(f"Unexpected GXEON tool set: {sorted(names)}")
        agent = Agent(
            name="GXEON discovery scout",
            instructions=(
                "Use GXEON public MCP tools only to explain services and packs. "
                "Do not initiate checkout or claim payment has settled."
            ),
            mcp_servers=[server],
        )
        print(agent.name, "connected to", ", ".join(sorted(names)))
        # Runner.run is intentionally omitted: it invokes a model and may incur cost.


if __name__ == "__main__":
    asyncio.run(main())

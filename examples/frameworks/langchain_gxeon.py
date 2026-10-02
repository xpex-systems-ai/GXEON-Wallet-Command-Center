"""Read-only GXEON discovery through LangChain's native MCPAdapter.

Install: pip install "langchain[mcp]>=1.4.0"
Run:     python examples/frameworks/langchain_gxeon.py
No model key, GXEON key, checkout, or payment is needed.
"""
import asyncio

from langchain.mcp import MCPAdapter

PUBLIC_MCP = "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
DISCOVERY_TOOLS = {
    "gxeon_list_services",
    "gxeon_list_credit_packs",
    "gxeon_get_agent_buying_guide",
}


async def main() -> None:
    async with MCPAdapter(PUBLIC_MCP) as adapter:
        tools = await adapter.list_tools()
        by_name = {tool.name: tool for tool in tools}
        missing = DISCOVERY_TOOLS - by_name.keys()
        if missing:
            raise RuntimeError(f"GXEON discovery tools missing: {sorted(missing)}")
        print("GXEON tools:", ", ".join(sorted(by_name)))
        # Invoke only read-only discovery; never create a checkout from an agent demo.
        print("Services:", await by_name["gxeon_list_services"].ainvoke({}))
        print("Packs:", await by_name["gxeon_list_credit_packs"].ainvoke({}))


if __name__ == "__main__":
    asyncio.run(main())

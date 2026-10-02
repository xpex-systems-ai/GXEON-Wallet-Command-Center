"""Discover GXEON through the official MCP Python SDK (no LLM required).

Install: pip install mcp
Run:     python examples/frameworks/mcp_sdk_gxeon.py
Only public read-only tools are called. No GXEON key or payment is used.
"""
import asyncio

from mcp import Client

PUBLIC_MCP = "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"


async def main() -> None:
    async with Client(PUBLIC_MCP) as client:
        tools = await client.list_tools()
        print("GXEON discovery tools:", ", ".join(tool.name for tool in tools.tools))
        services = await client.call_tool("gxeon_list_services", {})
        print("Services:", services.structured_content)
        guide = await client.call_tool("gxeon_get_agent_buying_guide", {})
        print("Buying guide:", guide.structured_content)


if __name__ == "__main__":
    asyncio.run(main())

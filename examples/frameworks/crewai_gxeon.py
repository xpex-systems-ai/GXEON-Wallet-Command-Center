"""Attach GXEON's public, read-only MCP tools to a CrewAI Agent.

Install: pip install "crewai" "mcp"
Import build_market_agent into your CrewAI workflow. Calling an LLM or
kicking off a Crew is deliberately left to the consuming application.
"""
from crewai import Agent
from crewai.mcp import MCPServerHTTP
from crewai.mcp.filters import create_static_tool_filter

PUBLIC_MCP = "https://gxeon-wallet-command-center.vercel.app/api/v1/mcp?view=public-market"
DISCOVERY_TOOLS = [
    "gxeon_list_services",
    "gxeon_list_credit_packs",
    "gxeon_get_agent_buying_guide",
]


def build_market_agent() -> Agent:
    return Agent(
        role="GXEON capability scout",
        goal="Explain available GXEON services and prepaid packs accurately.",
        backstory="Read-only catalog specialist; never initiates purchases or claims settlement.",
        mcps=[
            MCPServerHTTP(
                url=PUBLIC_MCP,
                streamable=True,
                tool_filter=create_static_tool_filter(
                    allowed_tool_names=DISCOVERY_TOOLS
                ),
            )
        ],
    )

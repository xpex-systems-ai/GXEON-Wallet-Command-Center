import { QuantumOpportunity, generateOpportunityFingerprint } from "../../src/agent-economy/autonomous/types.js";

export class TestScoutFixtures {
  /**
   * Discovers developer leads (e.g. GitHub issues, syntax errors, bug triage).
   */
  async discoverFromGithubLeads(): Promise<QuantumOpportunity[]> {
    // Sample public developer bug leads matching Quick Fix
    const sampleLeads = [
      {
        id: 'gh_react_hook_crash_401',
        url: 'https://github.com/example-org/public-repo/issues/401',
        title: 'TypeError: Cannot read properties of undefined (reading useEffect) during SSR build',
        summary: 'Next.js 14 App Router hydration mismatch and useEffect syntax violation in production bundle',
        buyerType: 'developer' as const,
      },
      {
        id: 'gh_ts_type_mismatch_88',
        url: 'https://github.com/example-org/api-service/issues/88',
        title: 'TypeScript error TS2322: Type string is not assignable to type number in stripe payload',
        summary: 'Webhook handler failing in production due to unparsed amount string',
        buyerType: 'developer' as const,
      },
    ];

    return sampleLeads.map((lead) => {
      const fingerprint = generateOpportunityFingerprint('github_lead', lead.url, lead.summary);
      return {
        opportunityId: `opp_${lead.id}`,
        source: 'github_lead',
        sourceUrl: lead.url,
        detectedAt: new Date().toISOString(),
        category: 'developer_quick_fix',
        demandType: 'bug_fix',
        buyerType: lead.buyerType,
        description: `${lead.title} - ${lead.summary}`,
        requestedCapability: 'gxeon_quick_fix_v1',
        estimatedValue: 49.0,
        currency: 'BRL',
        protocol: 'stripe',
        publicContactMethod: 'github_issue',
        compatibleGxeonCapability: 'gxeon_quick_fix_v1',
        fitScore: 0,
        revenueScore: 0,
        riskScore: 0,
        confidence: 90,
        priorityScore: 0,
        fingerprint,
        status: 'SIGNAL',
      };
    });
  }

  /**
   * Discovers MCP registry / tool integration demand.
   */
  async discoverFromMcpRegistry(): Promise<QuantumOpportunity[]> {
    const sampleMcpDemand = [
      {
        id: 'mcp_json_tool_demand_12',
        url: 'https://registry.modelcontextprotocol.io/tools/json-validator',
        summary: 'Agent needing JSON schema verification tool for output guardrails',
      },
    ];

    return sampleMcpDemand.map((item) => {
      const fingerprint = generateOpportunityFingerprint('mcp_registry', item.url, item.summary);
      return {
        opportunityId: `opp_${item.id}`,
        source: 'mcp_registry',
        sourceUrl: item.url,
        detectedAt: new Date().toISOString(),
        category: 'agent_tooling',
        demandType: 'schema_validation',
        buyerType: 'agent',
        description: item.summary,
        requestedCapability: 'gxeon_json_validate_v1',
        estimatedValue: 0.02,
        currency: 'USDC',
        protocol: 'mcp',
        publicContactMethod: 'mcp_tool',
        compatibleGxeonCapability: 'gxeon_json_validate_v1',
        fitScore: 0,
        revenueScore: 0,
        riskScore: 0,
        confidence: 88,
        priorityScore: 0,
        fingerprint,
        status: 'SIGNAL',
      };
    });
  }

  /**
   * Discovers inbound developer/business leads.
   */
  async discoverFromInboundLeads(): Promise<QuantumOpportunity[]> {
    const sampleInbound = [
      {
        id: 'inbound_lead_stripe_checkout_fix',
        url: 'https://gxeon.network/intake/lead_9041',
        email: 'founder@fintechstartup.co',
        summary: 'Stripe webhook signature validation failing after version upgrade. Urgent production fix needed.',
      },
    ];

    return sampleInbound.map((item) => {
      const fingerprint = generateOpportunityFingerprint('inbound_lead', item.url, item.summary);
      return {
        opportunityId: `opp_${item.id}`,
        source: 'inbound_lead',
        sourceUrl: item.url,
        detectedAt: new Date().toISOString(),
        category: 'developer_quick_fix',
        demandType: 'emergency_patch',
        buyerType: 'developer',
        description: item.summary,
        requestedCapability: 'gxeon_quick_fix_v1',
        estimatedValue: 49.0,
        currency: 'BRL',
        protocol: 'stripe',
        publicContactMethod: 'email',
        compatibleGxeonCapability: 'gxeon_quick_fix_v1',
        fitScore: 0,
        revenueScore: 0,
        riskScore: 0,
        confidence: 95,
        priorityScore: 0,
        fingerprint,
        status: 'SIGNAL',
      };
    });
  }

}

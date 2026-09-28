import crypto from 'node:crypto';
import { AutonomousCandidate } from './types.js';
import { fetchAndIngestX402Demand } from '../connectors/x402BazaarConnector.js';

export class GxeonScout {
  /**
   * Scans public machine capability directories and protocols (x402 Bazaar, MCP registries).
   * Strict anti-spam: Only ingests public, machine-callable signals.
   */
  async scanPublicOpportunities(query = 'verification', limit = 10): Promise<AutonomousCandidate[]> {
    const opps = await fetchAndIngestX402Demand({ query, limit });
    const candidates: AutonomousCandidate[] = [];

    for (const opp of opps) {
      let compatibleCapability: AutonomousCandidate['compatibleCapability'] = 'NONE';
      if (opp.requiredCapability === 'gxeon_url_verify_v1') {
        compatibleCapability = 'gxeon_url_verify_v1';
      } else if (opp.requiredCapability === 'gxeon_json_validate_v1') {
        compatibleCapability = 'gxeon_json_validate_v1';
      }

      const candidate: AutonomousCandidate = {
        opportunityId: opp.opportunityId || `scout_${crypto.randomBytes(4).toString('hex')}`,
        source: 'x402_bazaar',
        resourceUrl: opp.sourceUrl,
        serviceName: opp.title,
        description: opp.summary,
        observedPrice: opp.statedPrice ?? null,
        observedCurrency: opp.priceCurrency || 'USD',
        calls30d: opp.calls30d ?? null,
        uniquePayers30d: opp.uniquePayers30d ?? null,
        compatibleCapability,
        fitScore: 0, // Unqualified until processed by GXEON_QUALIFIER
        machineContactMethod: opp.sourceUrl.includes('x402') ? 'x402' : 'rest_api',
        status: 'DISCOVERED',
        discoveredAt: opp.discoveredAt || new Date().toISOString(),
      };

      candidates.push(candidate);
    }

    return candidates;
  }
}

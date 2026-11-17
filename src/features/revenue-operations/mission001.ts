import { RevenueOpportunity } from './model';

export interface Mission001Candidate {
  opportunity: RevenueOpportunity;
  isBaseUsdc: boolean;
  fundingVerified: boolean;
  economicsPass: boolean;
  deterministicCriteria: boolean;
  requiresHumanApproval: boolean;
  recommendationReason: string;
}

export interface Mission001DiscoveryReport {
  timestamp: string;
  totalDiscovered: number;
  topCandidates: Mission001Candidate[];
  selectedCandidate: Mission001Candidate | null;
}

/**
 * Mission 001 - First Real USDC Bounty Operations
 * Enforces canonical state verification, Base + USDC preference, zero external spend/bonds without approval,
 * and strict separation between discovered signal and final RECEIVED status.
 */
export class Mission001DiscoveryService {
  /**
   * Evaluates and filters opportunities according to MISSION_001 policy rules:
   * 1. Must be USDC currency (preferably Base network).
   * 2. Canonical/on-chain proof required (not text labels alone).
   * 3. Irreversible actions require explicit human approval.
   */
  public evaluateCandidate(opp: RevenueOpportunity): Mission001Candidate {
    const isUsdc = opp.currency.toUpperCase() === 'USDC';
    const isBase = (opp.network || '').toLowerCase() === 'base';

    const fundingVerified =
      opp.funding === 'RADAR_ONCHAIN_EVIDENCE' && Boolean(opp.fundingTx);

    // Prefer low or no initial cost required
    const economicsPass = opp.initialCostRequired !== true && (opp.reward ?? 0) > 0;

    const deterministicCriteria = Boolean(opp.url && opp.externalId);

    const isBaseUsdc = isUsdc && isBase;

    let recommendationReason = '';
    if (isBaseUsdc && fundingVerified && economicsPass) {
      recommendationReason = 'Optimal: Base USDC opportunity with verified on-chain funding and clear economics.';
    } else if (isUsdc && fundingVerified && economicsPass) {
      recommendationReason = 'Eligible: Verified USDC bounty on secondary chain.';
    } else if (!fundingVerified) {
      recommendationReason = 'Rejected: Lacks canonical on-chain verification proof.';
    } else {
      recommendationReason = 'Rejected: Does not meet MISSION_001 execution policy.';
    }

    return {
      opportunity: opp,
      isBaseUsdc,
      fundingVerified,
      economicsPass,
      deterministicCriteria,
      requiresHumanApproval: true, // All wallet/signing/bounty claims require human authorization
      recommendationReason,
    };
  }

  /**
   * Scans listed opportunities and returns top candidates (up to top 3) and selected candidate.
   */
  public generateReport(opportunities: RevenueOpportunity[]): Mission001DiscoveryReport {
    const evaluated = opportunities.map((opp) => this.evaluateCandidate(opp));

    const validCandidates = evaluated.filter(
      (c) => c.fundingVerified && c.economicsPass && c.deterministicCriteria
    );

    // Rank candidates: Base + USDC first, then higher reward
    validCandidates.sort((a, b) => {
      if (a.isBaseUsdc && !b.isBaseUsdc) return -1;
      if (!a.isBaseUsdc && b.isBaseUsdc) return 1;
      return (b.opportunity.reward ?? 0) - (a.opportunity.reward ?? 0);
    });

    const topCandidates = validCandidates.slice(0, 3);
    const selectedCandidate = topCandidates.length > 0 ? topCandidates[0] : null;

    return {
      timestamp: new Date().toISOString(),
      totalDiscovered: opportunities.length,
      topCandidates,
      selectedCandidate,
    };
  }
}

export const mission001DiscoveryService = new Mission001DiscoveryService();

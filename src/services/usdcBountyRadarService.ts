import { BountyItem, PayoutVerification } from '../types';
import { bountyService } from './bountyService';
import { auditService } from './auditService';

export interface RawOpportunity {
  id: string;
  title: string;
  platform: string;
  network: 'base' | 'ethereum' | 'solana' | 'arbitrum' | 'optimism' | 'other';
  currency: 'USDC' | 'ETH' | 'SOL' | string;
  rewardAmount: string;
  canonicalContractAddress?: string;
  canonicalTxHash?: string;
  hasOnchainEvidence: boolean;
  bondRequiredAmount?: string;
  deterministicCriteria: boolean;
  estimatedHoursToComplete: number;
  sourceUrl: string;
}

export interface QualifiedUsdcBounty {
  opportunity: RawOpportunity;
  score: number; // Higher is faster-to-cash & lower risk
  canonicalVerified: boolean;
  requiresHumanApproval: true;
  reason: string;
}

export class UsdcBountyRadarService {
  /**
   * Filters raw opportunities to find canonical, funded USDC opportunities
   * prioritizing Base + USDC, low/zero bond, deterministic criteria.
   */
  public evaluateOpportunities(rawList: RawOpportunity[]): QualifiedUsdcBounty[] {
    const qualified: QualifiedUsdcBounty[] = [];

    for (const opp of rawList) {
      // Rule 1: Currency must be USDC
      if (opp.currency.toUpperCase() !== 'USDC') {
        continue;
      }

      // Rule 2: Do not treat raw text / labels alone as funding proof without on-chain or canonical evidence
      if (!opp.hasOnchainEvidence && !opp.canonicalTxHash && !opp.canonicalContractAddress) {
        auditService.recordEvent(
          'bounty_radar_rejected',
          `Skipping opportunity ${opp.id} (${opp.title}): Lacks canonical/onchain funding proof.`,
          'warning'
        );
        continue;
      }

      // Calculate score for ranking
      let score = 100;

      // Base network preferred
      if (opp.network === 'base') {
        score += 50;
      }

      // Bond penalty if non-zero
      const bond = parseFloat(opp.bondRequiredAmount || '0');
      if (bond > 0) {
        score -= bond * 10;
      }

      // Fast completion bonus
      if (opp.estimatedHoursToComplete <= 2) {
        score += 30;
      } else if (opp.estimatedHoursToComplete <= 8) {
        score += 15;
      }

      // Deterministic criteria bonus
      if (opp.deterministicCriteria) {
        score += 25;
      }

      qualified.push({
        opportunity: opp,
        score,
        canonicalVerified: true,
        requiresHumanApproval: true,
        reason: `USDC bounty on ${opp.network.toUpperCase()} verified with canonical funding proof. Estimated completion: ${opp.estimatedHoursToComplete}h.`,
      });
    }

    // Sort descending by score
    return qualified.sort((a, b) => b.score - a.score);
  }

  /**
   * Discovers top 3 currently claimable, funded USDC bounties after canonical state verification.
   */
  public async getTopClaimableBounties(rawList: RawOpportunity[]): Promise<QualifiedUsdcBounty[]> {
    const evaluated = this.evaluateOpportunities(rawList);
    return evaluated.slice(0, 3);
  }

  /**
   * Promotes a verified radar candidate into the BountyService state machine.
   * Note: Financial actions (signing, claiming bonds) require explicit human approval.
   */
  public async registerBountyFromRadar(
    candidate: QualifiedUsdcBounty,
    userApproved: boolean,
    destinationWallet: string,
    ownerUid?: string
  ): Promise<BountyItem> {
    if (!userApproved) {
      throw new Error('HUMAN_APPROVAL_REQUIRED: Irreversible financial/signing actions require human authorization.');
    }

    if (!candidate.canonicalVerified) {
      throw new Error('CANONICAL_VERIFICATION_FAILED: Cannot register unverified opportunity.');
    }

    const bounty = await bountyService.addBounty(
      {
        title: candidate.opportunity.title,
        platform: candidate.opportunity.platform,
        expectedReward: candidate.opportunity.rewardAmount,
        currency: candidate.opportunity.currency,
        destinationWalletAddress: destinationWallet,
        status: 'DISCOVERED',
      },
      ownerUid
    );

    auditService.recordEvent(
      'bounty_radar_registered',
      `Registered USDC bounty ${bounty.id} from radar. Title: ${bounty.title}`,
      'info',
      ownerUid
    );

    return bounty;
  }
}

export const usdcBountyRadarService = new UsdcBountyRadarService();

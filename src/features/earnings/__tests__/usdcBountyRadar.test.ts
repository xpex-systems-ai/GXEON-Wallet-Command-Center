import { describe, it, expect, vi, beforeEach } from 'vitest';
import { usdcBountyRadarService, RawOpportunity } from '../../../services/usdcBountyRadarService';
import { bountyService } from '../../../services/bountyService';

describe('MISSION_001 — Live USDC Bounty Radar & Canonical Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockOpportunities: RawOpportunity[] = [
    {
      id: 'opp-1',
      title: 'Fix typo on Docs (Unverified text label)',
      platform: 'GitHub Issue',
      network: 'ethereum',
      currency: 'USDC',
      rewardAmount: '50',
      hasOnchainEvidence: false, // Lacks canonical proof
      deterministicCriteria: true,
      estimatedHoursToComplete: 1,
      sourceUrl: 'https://github.com/example/repo/issues/1',
    },
    {
      id: 'opp-2',
      title: 'Base USDC Verification Module',
      platform: 'BountiesNetwork',
      network: 'base',
      currency: 'USDC',
      rewardAmount: '150',
      canonicalContractAddress: '0x1111222233334444555566667777888899990000',
      canonicalTxHash: '0xabc1234567890',
      hasOnchainEvidence: true,
      deterministicCriteria: true,
      estimatedHoursToComplete: 2,
      sourceUrl: 'https://base.org/bounties/2',
    },
    {
      id: 'opp-3',
      title: 'Solana USDC Integration Test',
      platform: 'Superteam',
      network: 'other',
      currency: 'USDC',
      rewardAmount: '200',
      hasOnchainEvidence: true,
      canonicalTxHash: 'solana_tx_sig_123',
      deterministicCriteria: false,
      estimatedHoursToComplete: 5,
      sourceUrl: 'https://superteam.fun/bounties/3',
    },
    {
      id: 'opp-4',
      title: 'Ethereum Smart Contract Audit',
      platform: 'Gitcoin',
      network: 'ethereum',
      currency: 'ETH', // Non-USDC
      rewardAmount: '0.5',
      hasOnchainEvidence: true,
      canonicalTxHash: '0xeth123',
      deterministicCriteria: true,
      estimatedHoursToComplete: 10,
      sourceUrl: 'https://gitcoin.co/bounties/4',
    },
  ];

  it('filters out non-USDC and unverified text-only opportunities', async () => {
    const topCandidates = await usdcBountyRadarService.getTopClaimableBounties(mockOpportunities);

    expect(topCandidates.length).toBe(2);
    // Non-USDC and unverified github issue should be excluded
    const ids = topCandidates.map((c) => c.opportunity.id);
    expect(ids).not.toContain('opp-1'); // text label only
    expect(ids).not.toContain('opp-4'); // ETH reward
    expect(ids).toContain('opp-2');
    expect(ids).toContain('opp-3');
  });

  it('ranks Base + USDC bounties with fast completion higher', async () => {
    const topCandidates = await usdcBountyRadarService.getTopClaimableBounties(mockOpportunities);
    const topCandidate = topCandidates[0];

    expect(topCandidate.opportunity.id).toBe('opp-2');
    expect(topCandidate.opportunity.network).toBe('base');
    expect(topCandidate.opportunity.currency).toBe('USDC');
  });

  it('strictly enforces human approval for financial registration & claiming', async () => {
    const topCandidates = await usdcBountyRadarService.getTopClaimableBounties(mockOpportunities);
    const candidate = topCandidates[0];

    // Attempting registration without human approval must fail
    await expect(
      usdcBountyRadarService.registerBountyFromRadar(
        candidate,
        false, // human approval = false
        '0x71c8407c27dab54e627b0a726715f33346e0176b'
      )
    ).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');

    // With human approval = true, registration succeeds
    const registered = await usdcBountyRadarService.registerBountyFromRadar(
      candidate,
      true, // human approval = true
      '0x71c8407c27dab54e627b0a726715f33346e0176b'
    );

    expect(registered.id).toBeDefined();
    expect(registered.status).toBe('DISCOVERED');
    expect(registered.currency).toBe('USDC');
  });
});

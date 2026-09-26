import { describe, it, expect } from 'vitest';
import { BountyItem } from '../../../types';

/**
 * Helper function representing the strict GXEON accounting rules:
 * SUBMITTED != PAID.
 * Only PAID bounties can be counted towards confirmed received earnings.
 */
export function calculateBountyTotals(bounties: BountyItem[]): {
  confirmedReceivedTotal: number;
  pendingPipelineTotal: number;
  totalSubmissionsCount: number;
  paidCount: number;
  pendingCount: number;
} {
  let confirmedReceivedTotal = 0;
  let pendingPipelineTotal = 0;
  let paidCount = 0;
  let pendingCount = 0;

  for (const b of bounties) {
    const amount = parseFloat(b.expectedReward) || 0;
    if (b.status === 'PAID') {
      confirmedReceivedTotal += amount;
      paidCount++;
    } else if (
      b.status === 'SUBMITTED' ||
      b.status === 'UNDER_REVIEW' ||
      b.status === 'ACCEPTED' ||
      b.status === 'PAYOUT_PENDING'
    ) {
      pendingPipelineTotal += amount;
      pendingCount++;
    }
  }

  return {
    confirmedReceivedTotal,
    pendingPipelineTotal,
    totalSubmissionsCount: bounties.length,
    paidCount,
    pendingCount,
  };
}

describe('Bounty Accounting Rules (SUBMITTED != PAID)', () => {
  const sampleBounties: BountyItem[] = [
    {
      id: 'bounty-1',
      title: 'RustChain Node Benchmark',
      platform: 'RustChain Bounties',
      expectedReward: '250',
      currency: 'RTC',
      destinationWalletAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      status: 'SUBMITTED',
      createdAt: '2026-09-20T10:00:00Z',
      updatedAt: '2026-09-20T10:00:00Z',
    },
    {
      id: 'bounty-2',
      title: 'Solana Smart Contract Audit',
      platform: 'Superteam',
      expectedReward: '500',
      currency: 'USDC',
      destinationWalletAddress: '0x1234...5678',
      status: 'UNDER_REVIEW',
      createdAt: '2026-09-21T10:00:00Z',
      updatedAt: '2026-09-21T10:00:00Z',
    },
    {
      id: 'bounty-3',
      title: 'Security Vulnerability Report',
      platform: 'Immunefi',
      expectedReward: '1000',
      currency: 'USDC',
      destinationWalletAddress: '0x1234...5678',
      status: 'PAID',
      transactionHash: '0xabc123...',
      createdAt: '2026-09-15T10:00:00Z',
      updatedAt: '2026-09-22T10:00:00Z',
    },
  ];

  it('strictly isolates submitted/under-review bounties from confirmed paid earnings', () => {
    const result = calculateBountyTotals(sampleBounties);

    expect(result.confirmedReceivedTotal).toBe(1000);
    expect(result.paidCount).toBe(1);

    expect(result.pendingPipelineTotal).toBe(750); // 250 + 500
    expect(result.pendingCount).toBe(2);

    expect(result.totalSubmissionsCount).toBe(3);
  });

  it('does not add rejected or discovered bounties to pending payout pipeline', () => {
    const listWithOthers: BountyItem[] = [
      ...sampleBounties,
      {
        id: 'bounty-4',
        title: 'Draft Discovery',
        platform: 'Gitcoin',
        expectedReward: '300',
        currency: 'ETH',
        destinationWalletAddress: '0x1234...5678',
        status: 'DISCOVERED',
        createdAt: '2026-09-23T10:00:00Z',
        updatedAt: '2026-09-23T10:00:00Z',
      },
      {
        id: 'bounty-5',
        title: 'Expired Proposal',
        platform: 'Layer3',
        expectedReward: '150',
        currency: 'USDC',
        destinationWalletAddress: '0x1234...5678',
        status: 'REJECTED',
        createdAt: '2026-09-23T10:00:00Z',
        updatedAt: '2026-09-23T10:00:00Z',
      },
    ];

    const result = calculateBountyTotals(listWithOthers);
    expect(result.confirmedReceivedTotal).toBe(1000);
    expect(result.pendingPipelineTotal).toBe(750);
  });
});

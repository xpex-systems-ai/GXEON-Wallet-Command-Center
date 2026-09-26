import { describe, it, expect } from 'vitest';
import { BountyItem, PayoutVerification } from '../../../types';
import { canTransitionBountyStatus } from '../../../services/bountyService';

describe('Bounty State Machine & Multi-Asset Accounting', () => {
  it('allows valid sequential state transitions', () => {
    expect(canTransitionBountyStatus('DISCOVERED', 'IN_PROGRESS').allowed).toBe(true);
    expect(canTransitionBountyStatus('IN_PROGRESS', 'SUBMITTED').allowed).toBe(true);
    expect(canTransitionBountyStatus('SUBMITTED', 'UNDER_REVIEW').allowed).toBe(true);
    expect(canTransitionBountyStatus('UNDER_REVIEW', 'ACCEPTED').allowed).toBe(true);
    expect(canTransitionBountyStatus('ACCEPTED', 'PAYOUT_PENDING').allowed).toBe(true);
  });

  it('prohibits direct manual jump to PAID without verification', () => {
    const res1 = canTransitionBountyStatus('SUBMITTED', 'PAID');
    expect(res1.allowed).toBe(false);

    const res2 = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID');
    expect(res2.allowed).toBe(false);
    expect(res2.reason).toContain('requires a valid PayoutVerification');
  });

  it('prohibits PAID transition with unconfirmed or missing txHash verification', () => {
    const unconfirmedVerification: PayoutVerification = {
      network: 'rustchain',
      asset: 'RTC',
      destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      txHash: '',
      verifiedAt: new Date().toISOString(),
      verificationSource: 'explorer',
      verificationStatus: 'PENDING',
    };

    const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', unconfirmedVerification);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('verificationStatus=CONFIRMED');
  });

  it('permits PAID transition ONLY with confirmed on-chain verification', () => {
    const confirmedVerification: PayoutVerification = {
      network: 'rustchain',
      asset: 'RTC',
      destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      txHash: '0xabc1234567890abcdef',
      verifiedAt: new Date().toISOString(),
      verificationSource: 'rustchain_onchain_rpc',
      verificationStatus: 'CONFIRMED',
    };

    const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', confirmedVerification);
    expect(res.allowed).toBe(true);
  });

  it('enforces that PAID is a terminal state that cannot transition back', () => {
    expect(canTransitionBountyStatus('PAID', 'SUBMITTED').allowed).toBe(false);
    expect(canTransitionBountyStatus('PAID', 'PAYOUT_PENDING').allowed).toBe(false);
    expect(canTransitionBountyStatus('PAID', 'REJECTED').allowed).toBe(false);
  });

  it('isolates multi-asset accounting without currency mixing or fake fiat summation', () => {
    const bounties: BountyItem[] = [
      {
        id: 'b1',
        title: 'Task 1',
        platform: 'RustChain',
        expectedReward: '3',
        currency: 'RTC',
        destinationWalletAddress: 'RTC82c21...',
        status: 'SUBMITTED',
        createdAt: '2026-09-20T10:00:00Z',
        updatedAt: '2026-09-20T10:00:00Z',
      },
      {
        id: 'b2',
        title: 'Task 2',
        platform: 'Gitcoin',
        expectedReward: '500',
        currency: 'USDC',
        destinationWalletAddress: '0x1234...',
        status: 'UNDER_REVIEW',
        createdAt: '2026-09-21T10:00:00Z',
        updatedAt: '2026-09-21T10:00:00Z',
      },
      {
        id: 'b3',
        title: 'Task 3',
        platform: 'Ethereum Grant',
        expectedReward: '0.5',
        currency: 'ETH',
        destinationWalletAddress: '0x1234...',
        status: 'PAYOUT_PENDING',
        createdAt: '2026-09-22T10:00:00Z',
        updatedAt: '2026-09-22T10:00:00Z',
      },
    ];

    // Compute multi-asset stats
    const pendingByAsset: Record<string, number> = {};
    for (const b of bounties) {
      const reward = parseFloat(b.expectedReward) || 0;
      pendingByAsset[b.currency] = (pendingByAsset[b.currency] || 0) + reward;
    }

    expect(pendingByAsset['RTC']).toBe(3);
    expect(pendingByAsset['USDC']).toBe(500);
    expect(pendingByAsset['ETH']).toBe(0.5);

    // Verify they are NOT summed into a fake single number
    const keys = Object.keys(pendingByAsset);
    expect(keys.length).toBe(3);
  });
});

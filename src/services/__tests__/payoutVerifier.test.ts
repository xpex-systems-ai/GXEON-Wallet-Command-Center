import { describe, it, expect } from 'vitest';
import { payoutVerifier } from '../payoutVerifier';
import { BountyItem } from '../../types';

describe('Payout Verification Engine', () => {
  it('returns UNVERIFIED when txHash is missing', async () => {
    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-1',
      network: 'rustchain',
      asset: 'RTC',
      destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      expectedAmount: '50',
    });

    expect(result.verificationStatus).toBe('UNVERIFIED');
    expect(result.txHash).toBe('');
  });

  it('returns FAILED when txHash format is invalid', async () => {
    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-2',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: 'invalid_short_hash',
    });

    expect(result.verificationStatus).toBe('FAILED');
  });

  it('verifies valid EVM transaction hash and confirms verification', async () => {
    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-3',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.txHash).toBe('0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b');
  });

  it('evaluates canMarkAsPaid strictly based on confirmed verification', () => {
    const unconfirmedBounty: BountyItem = {
      id: 'b-unconf',
      title: 'Task 1',
      platform: 'GitHub',
      expectedReward: '100',
      currency: 'RTC',
      destinationWalletAddress: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      status: 'SUBMITTED',
      createdAt: '2026-09-26T12:00:00Z',
      updatedAt: '2026-09-26T12:00:00Z',
    };

    expect(payoutVerifier.canMarkAsPaid(unconfirmedBounty)).toBe(false);

    const confirmedBounty: BountyItem = {
      ...unconfirmedBounty,
      payoutVerification: {
        network: 'rustchain',
        asset: 'RTC',
        destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
        txHash: 'rtctx_1234567890abcdef1234567890abcdef',
        verifiedAt: '2026-09-26T12:30:00Z',
        verificationSource: 'rustchain_onchain_attestation',
        verificationStatus: 'CONFIRMED',
      },
    };

    expect(payoutVerifier.canMarkAsPaid(confirmedBounty)).toBe(true);
  });
});

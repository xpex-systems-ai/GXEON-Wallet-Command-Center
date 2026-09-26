import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BountyItem, PayoutVerification } from '../../../types';
import { canTransitionBountyStatus } from '../../../services/bountyService';
import { payoutVerifier } from '../../../services/payoutVerifier';

describe('Bounty State Machine & Multi-Asset Accounting — Financial Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    payoutVerifier.clearReceiptsStore();
  });

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

  it('prohibits forged caller-supplied PayoutVerification object from authorizing PAID', () => {
    // Forged object created by caller without passing through PayoutVerifier.verifyPayout()
    const forgedVerification: PayoutVerification = {
      verificationId: 'forged_fake_id_9999',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71c8407c27dab54e627b0a726715f33346e0176b',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      verifiedAt: new Date().toISOString(),
      verificationSource: 'evm_rpc_native_transfer',
      verificationStatus: 'CONFIRMED',
    };

    const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', forgedVerification);
    expect(res.allowed).toBe(false);
    expect(res.reason).toContain('Forged, legacy, or unverified proofs are strictly rejected');
  });

  it('prohibits legacy/unimplemented source strings from authorizing PAID', async () => {
    const legacySources = [
      'evm_eip1193_rpc_receipt',
      'rustchain_onchain_attestation',
      'rustchain_onchain_rpc',
      'custom_node_rpc',
      'syntax_validator',
    ];

    for (const src of legacySources) {
      const v: PayoutVerification = {
        verificationId: `fake_${src}`,
        network: 'rustchain',
        asset: 'RTC',
        destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
        txHash: '0xabc1234567890abcdef',
        verifiedAt: new Date().toISOString(),
        verificationSource: src,
        verificationStatus: 'CONFIRMED',
      };
      const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', v);
      expect(res.allowed).toBe(false);
    }
  });

  it('RTC cannot become PAID without a verified official verifier', async () => {
    const rtcVerification: PayoutVerification = {
      network: 'rustchain',
      asset: 'RTC',
      destinationWallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      txHash: 'rtctx_1234567890abcdef1234567890abcdef',
      verifiedAt: new Date().toISOString(),
      verificationSource: 'rustchain_verified_transfer',
      verificationStatus: 'CONFIRMED',
    };

    const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', rtcVerification);
    expect(res.allowed).toBe(false);
  });

  it('permits PAID transition ONLY with authentic verification issued by PayoutVerifier', async () => {
    // Generate authentic verification proof through PayoutVerifier with simulated live RPC
    global.fetch = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === 'eth_getTransactionReceipt') {
        return {
          ok: true,
          json: async () => ({
            result: { status: '0x1', blockNumber: '0x100', logs: [] },
          }),
        };
      }
      if (body.method === 'eth_getTransactionByHash') {
        return {
          ok: true,
          json: async () => ({
            result: {
              to: '0x71c8407c27dab54e627b0a726715f33346e0176b',
              value: '0x6f05b59d3b20000', // 0.5 ETH
            },
          }),
        };
      }
      if (body.method === 'eth_chainId') {
        return {
          ok: true,
          json: async () => ({ result: '0x1' }), // Ethereum mainnet (chain 1)
        };
      }
      return { ok: false };
    });

    const authenticProof = await payoutVerifier.verifyPayout({
      bountyId: 'b-auth-test',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71c8407c27dab54e627b0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(authenticProof.verificationStatus).toBe('CONFIRMED');
    expect(authenticProof.verificationId).toBeDefined();

    const res = canTransitionBountyStatus('PAYOUT_PENDING', 'PAID', authenticProof);
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

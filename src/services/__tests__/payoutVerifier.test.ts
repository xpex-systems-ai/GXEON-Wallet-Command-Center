import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payoutVerifier } from '../payoutVerifier';
import { BountyItem } from '../../types';

describe('Payout Verification Engine — Money Truth', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it('returns FORMAT_VALID for valid EVM syntax when live RPC is not active', async () => {
    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-3',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
    expect(result.txHash).toBe('0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b');
  });

  it('arbitrary data.result does NOT confirm without receipt & tx matching', async () => {
    // Mock generic non-empty result
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { randomField: 'some_arbitrary_value' },
      }),
    } as any);

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-arbitrary',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('successful EVM tx to WRONG destination does NOT confirm payout', async () => {
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
              to: '0x0000000000000000000000000000000000000000', // Unrelated destination!
              value: '0x6f05b59d3b20000', // 0.5 ETH in wei
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-wrong-dest',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('successful EVM tx with WRONG amount does NOT confirm payout', async () => {
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
              to: '0x71C8407C27daB54E627B0a726715f33346e0176b',
              value: '0x16345785d8a0000', // 0.1 ETH in wei instead of expected 0.5 ETH
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-wrong-amount',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('EVM native transfer confirms as evm_rpc_native_transfer when recipient and amount match', async () => {
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
              to: '0x71C8407C27daB54E627B0a726715f33346e0176b',
              value: '0x6f05b59d3b20000', // 0.5 ETH (500000000000000000 wei)
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-native-confirmed',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('evm_rpc_native_transfer');
  });

  it('ERC-20 transfer to WRONG recipient does NOT confirm payout', async () => {
    global.fetch = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === 'eth_getTransactionReceipt') {
        return {
          ok: true,
          json: async () => ({
            result: {
              status: '0x1',
              logs: [
                {
                  topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    '0x0000000000000000000000001111111111111111111111111111111111111111',
                    '0x0000000000000000000000009999999999999999999999999999999999999999', // wrong recipient
                  ],
                  data: '0x000000000000000000000000000000000000000000000000000000001dcd6500', // 500 USDC (500 * 10^6)
                },
              ],
            },
          }),
        };
      }
      if (body.method === 'eth_getTransactionByHash') {
        return {
          ok: true,
          json: async () => ({
            result: {
              to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC contract
              value: '0x0',
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-erc20-wrong-dest',
      network: 'evm',
      asset: 'USDC',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '500',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('ERC-20 transfer confirms as evm_rpc_erc20_transfer when recipient and amount match Transfer log', async () => {
    global.fetch = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === 'eth_getTransactionReceipt') {
        return {
          ok: true,
          json: async () => ({
            result: {
              status: '0x1',
              logs: [
                {
                  topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    '0x0000000000000000000000001111111111111111111111111111111111111111',
                    '0x00000000000000000000000071c8407c27dab54e627b0a726715f33346e0176b', // padded destinationWallet
                  ],
                  data: '0x000000000000000000000000000000000000000000000000000000001dcd6500', // 500 * 10^6 = 500000000 = 0x1dcd6500
                },
              ],
            },
          }),
        };
      }
      if (body.method === 'eth_getTransactionByHash') {
        return {
          ok: true,
          json: async () => ({
            result: {
              to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // USDC contract
              value: '0x0',
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-erc20-confirmed',
      network: 'evm',
      asset: 'USDC',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '500',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('evm_rpc_erc20_transfer');
  });

  it('reverted EVM transaction (status 0) produces FAILED', async () => {
    global.fetch = vi.fn().mockImplementation(async (_url, init: any) => {
      const body = JSON.parse(init.body);
      if (body.method === 'eth_getTransactionReceipt') {
        return {
          ok: true,
          json: async () => ({
            result: { status: '0x0', logs: [] },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-reverted',
      network: 'evm',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FAILED');
    expect(result.verificationSource).toBe('evm_receipt_reverted');
  });

  it('evaluates canMarkAsPaid strictly based on confirmed verification and live source', () => {
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

    // Format valid is NOT allowed to be marked paid
    const formatValidBounty: BountyItem = {
      ...unconfirmedBounty,
      payoutVerification: {
        network: 'evm',
        asset: 'ETH',
        destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
        txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
        verifiedAt: '2026-09-26T12:30:00Z',
        verificationSource: 'syntax_validator',
        verificationStatus: 'FORMAT_VALID',
      },
    };
    expect(payoutVerifier.canMarkAsPaid(formatValidBounty)).toBe(false);

    const confirmedBounty: BountyItem = {
      ...unconfirmedBounty,
      payoutVerification: {
        network: 'evm',
        asset: 'USDC',
        destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
        txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
        verifiedAt: '2026-09-26T12:30:00Z',
        verificationSource: 'evm_rpc_erc20_transfer',
        verificationStatus: 'CONFIRMED',
      },
    };

    expect(payoutVerifier.canMarkAsPaid(confirmedBounty)).toBe(true);
  });
});

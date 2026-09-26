import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payoutVerifier } from '../payoutVerifier';
import { BountyItem } from '../../types';

describe('Payout Verification Engine — Money Truth & Financial Integrity', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    payoutVerifier.clearReceiptsStore();
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
      network: 'ethereum',
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
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
    expect(result.txHash).toBe('0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b');
  });

  it('arbitrary data.result does NOT confirm without receipt & tx matching', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: { randomField: 'some_arbitrary_value' },
      }),
    } as any);

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-arbitrary',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('wrong EVM network / chainId mismatch does NOT confirm payout', async () => {
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
              value: '0x6f05b59d3b20000',
            },
          }),
        };
      }
      if (body.method === 'eth_chainId') {
        return {
          ok: true,
          json: async () => ({
            result: '0x2105', // Base chain (8453) instead of requested Ethereum (1)
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-net-mismatch',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FAILED');
    expect(result.verificationSource).toBe('evm_network_mismatch');
  });

  it('fake ERC20 token contract / wrong token address does NOT confirm USDC', async () => {
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
                  address: '0x1111111111111111111111111111111111111111', // FAKE CONTRACT! Not real USDC
                  topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    '0x0000000000000000000000001111111111111111111111111111111111111111',
                    '0x00000000000000000000000071c8407c27dab54e627b0a726715f33346e0176b',
                  ],
                  data: '0x000000000000000000000000000000000000000000000000000000001dcd6500', // 500 USDC
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
            result: { to: '0x1111111111111111111111111111111111111111', value: '0x0' },
          }),
        };
      }
      if (body.method === 'eth_chainId') {
        return {
          ok: true,
          json: async () => ({ result: '0x1' }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-fake-token',
      network: 'ethereum',
      asset: 'USDC',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '500',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('verified ERC-20 transfer confirms as evm_rpc_erc20_transfer when contract, recipient, amount and chainId match', async () => {
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
                  address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // REAL Ethereum USDC contract
                  topics: [
                    '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef',
                    '0x0000000000000000000000001111111111111111111111111111111111111111',
                    '0x00000000000000000000000071c8407c27dab54e627b0a726715f33346e0176b', // padded destination
                  ],
                  data: '0x000000000000000000000000000000000000000000000000000000001dcd6500', // 500 * 10^6
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
            result: { to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', value: '0x0' },
          }),
        };
      }
      if (body.method === 'eth_chainId') {
        return {
          ok: true,
          json: async () => ({ result: '0x1' }), // Ethereum mainnet
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-erc20-confirmed',
      network: 'ethereum',
      asset: 'USDC',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '500',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://rpc.example.com',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('evm_rpc_erc20_transfer');
    expect(result.verificationId).toBeDefined();
  });

  it('Solana destination presence alone without balance delta does NOT confirm payout', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          meta: {
            err: null,
            preBalances: [1000000000, 500000000],
            postBalances: [1000000000, 500000000], // Delta is 0! No SOL transferred to destination
          },
          transaction: {
            message: {
              accountKeys: [
                { pubkey: 'Sender111111111111111111111111111111111111' },
                { pubkey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }, // Destination
              ],
            },
          },
        },
      }),
    } as any);

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-sol-no-delta',
      network: 'solana',
      asset: 'SOL',
      destinationWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      expectedAmount: '2.5',
      txHash: '5VERi8qA7CbpGLrGeK19bLTKCBsmReN57yE9c1A2g1YV4tE2X91d9M8yB7D4c3F2A1E9b8C7D6E5F4A3B2C1D2E9',
      customRpcEndpoint: 'https://api.mainnet-beta.solana.com',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('Solana native transfer confirms as solana_rpc_verified_transfer when balance delta matches expectedAmount', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        result: {
          meta: {
            err: null,
            preBalances: [5000000000, 1000000000],
            postBalances: [2500000000, 3500000000], // Delta is 2.5 SOL (2500000000 lamports)
          },
          transaction: {
            message: {
              accountKeys: [
                { pubkey: 'Sender111111111111111111111111111111111111' },
                { pubkey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }, // Destination at index 1
              ],
            },
          },
        },
      }),
    } as any);

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-sol-confirmed',
      network: 'solana',
      asset: 'SOL',
      destinationWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      expectedAmount: '2.5',
      txHash: '5VERi8qA7CbpGLrGeK19bLTKCBsmReN57yE9c1A2g1YV4tE2X91d9M8yB7D4c3F2A1E9b8C7D6E5F4A3B2C1D2E9',
      customRpcEndpoint: 'https://api.mainnet-beta.solana.com',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('solana_rpc_verified_transfer');
    expect(result.verificationId).toBeDefined();
  });

  it('evaluates canMarkAsPaid strictly based on authentic internally issued verification', () => {
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

    // Forged verification object NOT in receipts store
    const forgedBounty: BountyItem = {
      ...unconfirmedBounty,
      payoutVerification: {
        verificationId: 'forged_fake_id_1234',
        network: 'ethereum',
        asset: 'USDC',
        destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
        txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
        verifiedAt: '2026-09-26T12:30:00Z',
        verificationSource: 'evm_rpc_erc20_transfer',
        verificationStatus: 'CONFIRMED',
      },
    };

    expect(payoutVerifier.canMarkAsPaid(forgedBounty)).toBe(false);
  });
});

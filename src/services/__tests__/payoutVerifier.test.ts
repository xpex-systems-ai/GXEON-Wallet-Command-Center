import { describe, it, expect, vi, beforeEach } from 'vitest';
import { payoutVerifier } from '../payoutVerifier';
import { BountyItem } from '../../types';

describe('Payout Verification Engine — Trusted Money Source & Financial Gate', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    payoutVerifier.clearReceiptsStore();
    delete (global as any).window;
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

  it('caller-supplied customRpcEndpoint is diagnostic ONLY and CANNOT confirm payment even with matching spoofed data', async () => {
    // Malicious custom RPC controlled by caller
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('attacker-controlled-rpc.com')) {
        return {
          ok: true,
          json: async () => ({
            result: {
              status: '0x1',
              to: '0x71C8407C27daB54E627B0a726715f33346e0176b',
              value: '0x6f05b59d3b20000',
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-attacker',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71C8407C27daB54E627B0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
      customRpcEndpoint: 'https://attacker-controlled-rpc.com',
    });

    // CRITICAL: Must NEVER be CONFIRMED
    expect(result.verificationStatus).toBe('FORMAT_VALID');
    expect(result.verificationSource).toBe('diagnostic_custom_rpc_untrusted');
  });

  it('injected EIP-1193 MetaMask provider confirms valid native ETH transfer', async () => {
    (global as any).window = {
      ethereum: {
        request: vi.fn().mockImplementation(async ({ method }) => {
          if (method === 'eth_chainId') return '0x1'; // Ethereum mainnet
          if (method === 'eth_getTransactionReceipt') {
            return {
              status: '0x1',
              blockNumber: '0x1000',
              logs: [],
            };
          }
          if (method === 'eth_getTransactionByHash') {
            return {
              to: '0x71c8407c27dab54e627b0a726715f33346e0176b',
              value: '0x6f05b59d3b20000', // 0.5 ETH in wei
            };
          }
          return null;
        }),
      },
    };

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-injected-native',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71c8407c27dab54e627b0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('evm_rpc_native_transfer');
    expect(result.rpcProviderId).toBe('injected_eip1193_provider');
    expect(result.chainId).toBe(1);
    expect(result.verificationId).toBeDefined();
  });

  it('trusted network RPC endpoint confirms verified ERC-20 USDC transfer', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string, init: any) => {
      // Must query trusted allowlisted endpoint
      if (url.includes('cloudflare-eth.com') || url.includes('eth.llamarpc.com')) {
        const body = JSON.parse(init.body);
        if (body.method === 'eth_chainId') return { ok: true, json: async () => ({ result: '0x1' }) };
        if (body.method === 'eth_getTransactionReceipt') {
          return {
            ok: true,
            json: async () => ({
              result: {
                status: '0x1',
                logs: [
                  {
                    address: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // Real Ethereum USDC
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
              result: { to: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', value: '0x0' },
            }),
          };
        }
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-trusted-erc20',
      network: 'ethereum',
      asset: 'USDC',
      destinationWallet: '0x71c8407c27dab54e627b0a726715f33346e0176b',
      expectedAmount: '500',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('evm_rpc_erc20_transfer');
    expect(result.rpcProviderId).toBe('trusted_network_rpc');
    expect(result.amount).toBe('500');
    expect(result.verificationId).toBeDefined();
  });

  it('injected provider with wrong chainId FAILS verification', async () => {
    (global as any).window = {
      ethereum: {
        request: vi.fn().mockImplementation(async ({ method }) => {
          if (method === 'eth_chainId') return '0x2105'; // Base (8453) instead of Ethereum (1)
          if (method === 'eth_getTransactionReceipt') return { status: '0x1' };
          if (method === 'eth_getTransactionByHash') {
            return { to: '0x71c8407c27dab54e627b0a726715f33346e0176b', value: '0x6f05b59d3b20000' };
          }
          return null;
        }),
      },
    };

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-chain-mismatch',
      network: 'ethereum',
      asset: 'ETH',
      destinationWallet: '0x71c8407c27dab54e627b0a726715f33346e0176b',
      expectedAmount: '0.5',
      txHash: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e2f3a4b',
    });

    expect(result.verificationStatus).toBe('FAILED');
    expect(result.verificationSource).toBe('evm_network_mismatch');
  });

  it('trusted Solana RPC confirms valid native SOL transfer with balance delta', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.mainnet-beta.solana.com')) {
        return {
          ok: true,
          json: async () => ({
            result: {
              meta: {
                err: null,
                preBalances: [5000000000, 1000000000],
                postBalances: [2500000000, 3500000000], // Delta 2.5 SOL (2500000000 lamports)
              },
              transaction: {
                message: {
                  accountKeys: [
                    { pubkey: 'Sender111111111111111111111111111111111111' },
                    { pubkey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
                  ],
                },
              },
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-sol-trusted',
      network: 'solana',
      asset: 'SOL',
      destinationWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      expectedAmount: '2.5',
      txHash: '5VERi8qA7CbpGLrGeK19bLTKCBsmReN57yE9c1A2g1YV4tE2X91d9M8yB7D4c3F2A1E9b8C7D6E5F4A3B2C1D2E9',
    });

    expect(result.verificationStatus).toBe('CONFIRMED');
    expect(result.verificationSource).toBe('solana_rpc_verified_transfer');
    expect(result.rpcProviderId).toBe('trusted_solana_rpc');
    expect(result.verificationId).toBeDefined();
  });

  it('fake Solana delta or wrong amount does NOT confirm', async () => {
    global.fetch = vi.fn().mockImplementation(async (url: string) => {
      if (url.includes('api.mainnet-beta.solana.com')) {
        return {
          ok: true,
          json: async () => ({
            result: {
              meta: {
                err: null,
                preBalances: [5000000000, 1000000000],
                postBalances: [4900000000, 1100000000], // Delta is only 0.1 SOL instead of 2.5 SOL
              },
              transaction: {
                message: {
                  accountKeys: [
                    { pubkey: 'Sender111111111111111111111111111111111111' },
                    { pubkey: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' },
                  ],
                },
              },
            },
          }),
        };
      }
      return { ok: false };
    });

    const result = await payoutVerifier.verifyPayout({
      bountyId: 'b-sol-wrong-delta',
      network: 'solana',
      asset: 'SOL',
      destinationWallet: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      expectedAmount: '2.5',
      txHash: '5VERi8qA7CbpGLrGeK19bLTKCBsmReN57yE9c1A2g1YV4tE2X91d9M8yB7D4c3F2A1E9b8C7D6E5F4A3B2C1D2E9',
    });

    expect(result.verificationStatus).toBe('FORMAT_VALID');
  });

  it('evaluates canMarkAsPaid strictly based on authentic internally issued verification in store', () => {
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

    // Forged verification object with fabricated verificationId not present in store
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

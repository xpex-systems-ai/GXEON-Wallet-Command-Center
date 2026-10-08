import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readOfficialBaseWallet } from './baseWalletOnchain';

const rpc = vi.hoisted(() => ({
  getBalance: vi.fn(), readContract: vi.fn(), getBlockNumber: vi.fn(),
}));
vi.mock('viem', async (original) => ({
  ...(await original<typeof import('viem')>()),
  createPublicClient: () => rpc,
}));

describe('official GXEON Base wallet reader', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rpc.getBalance.mockResolvedValue(1000000000000000n);
    rpc.readContract.mockResolvedValue(1234567n);
    rpc.getBlockNumber.mockResolvedValue(12345678n);
  });

  it('reads Base native USDC (6 decimals) and ETH without signing', async () => {
    const snapshot = await readOfficialBaseWallet();
    expect(snapshot).toMatchObject({
      status: 'CONFIRMED_ONCHAIN', chainId: 8453,
      address: '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428',
      custody: 'SELF_CUSTODY_READ_ONLY',
      balances: { eth: '0.001', usdc: '1.234567' },
    });
    expect(rpc.readContract).toHaveBeenCalledWith(expect.objectContaining({
      address: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      functionName: 'balanceOf',
    }));
  });

  it('never fabricates zero balances when Base RPC is offline', async () => {
    rpc.readContract.mockRejectedValue(new Error('RPC timeout'));
    const snapshot = await readOfficialBaseWallet();
    expect(snapshot).toMatchObject({ status: 'UNAVAILABLE', balances: null });
  });
});

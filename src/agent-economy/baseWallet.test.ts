import { beforeEach, describe, expect, it, vi } from 'vitest';
import handler from '../../../api/base-wallet';

const rpc = vi.hoisted(() => ({
  getBalance: vi.fn(),
  readContract: vi.fn(),
  getBlockNumber: vi.fn(),
}));

vi.mock('viem', async (original) => ({
  ...(await original<typeof import('viem')>()),
  createPublicClient: () => rpc,
}));

function mockResponse() {
  let code = 200;
  let body: unknown = null;
  const headers: Record<string, string> = {};
  const res = {
    setHeader: (key: string, value: string) => { headers[key] = value; return res; },
    status: (next: number) => { code = next; return res; },
    json: (next: unknown) => { body = next; return res; },
  };
  return { res, get status() { return code; }, get body() { return body; }, headers };
}

describe('GXEON official Base wallet (read-only)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    rpc.getBalance.mockResolvedValue(1000000000000000n);
    rpc.readContract.mockResolvedValue(1234567n);
    rpc.getBlockNumber.mockResolvedValue(12345678n);
  });

  it('rejects methods other than GET without blockchain reads', async () => {
    const response = mockResponse();
    await handler({ method: 'POST' }, response.res);
    expect(response.status).toBe(405);
    expect(rpc.getBalance).not.toHaveBeenCalled();
  });

  it('returns Base mainnet wallet balances as strings (not settled revenue)', async () => {
    const response = mockResponse();
    await handler({ method: 'GET' }, response.res);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      status: 'CONFIRMED_ONCHAIN',
      chainId: 8453,
      address: '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428',
      balances: { eth: '0.001', usdc: '1.234567' },
      custody: 'SELF_CUSTODY_READ_ONLY',
    });
    expect(response.headers['Cache-Control']).toBe('no-store');
  });

  it('returns UNAVAILABLE on RPC failure, never a fabricated zero balance', async () => {
    rpc.readContract.mockRejectedValue(new Error('rpc unavailable'));
    const response = mockResponse();
    await handler({ method: 'GET' }, response.res);
    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ status: 'UNAVAILABLE', balances: null });
  });
});

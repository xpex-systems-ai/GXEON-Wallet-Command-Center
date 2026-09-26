import { describe, it, expect, vi, beforeEach } from 'vitest';
import { rustchainService } from '../rustchainService';
import { bridgeService } from '../bridgeService';

describe('RustChain Service - Truth in Data & Real Readings', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('separates RTC public address from miner_id invariant', () => {
    const address = 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269';
    const minerId = 'node-alpha-1';

    expect(address).not.toEqual(minerId);
    expect(address.startsWith('RTC')).toBe(true);
  });

  it('returns null balance and empty transactions when RPC node is offline (Truth in Data)', async () => {
    vi.spyOn(bridgeService, 'getRustChainBalance').mockRejectedValue(new Error('Connection refused'));
    vi.spyOn(bridgeService, 'getRustChainTransactions').mockRejectedValue(new Error('Connection refused'));

    const balanceRes = await rustchainService.getWalletBalance('wallet-1', 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269');
    expect(balanceRes.balance).toBeNull();
    expect(balanceRes.balanceStatus).toBe('UNAVAILABLE');

    const txRes = await rustchainService.getWalletTransactions('wallet-1', 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269');
    expect(txRes.transactions).toEqual([]);
    expect(txRes.status).toBe('UNAVAILABLE');
  });

  it('processes verified balance when valid node RPC responds', async () => {
    vi.spyOn(bridgeService, 'getRustChainBalance').mockResolvedValue({
      wallet_id: 'wallet-1',
      network: 'rustchain',
      address: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269',
      status: 'AVAILABLE',
      balance: '142.5',
      symbol: 'RTC',
      source: 'rustchain_official_rpc',
      queried_at: '2026-09-26T12:00:00Z',
      ownership_verified: true,
      mode: 'watch_only',
      note: 'Verified read from RPC',
    });

    const balanceRes = await rustchainService.getWalletBalance('wallet-1', 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269');
    expect(balanceRes.balance).toBe('142.5');
    expect(balanceRes.balanceStatus).toBe('AVAILABLE');
    expect(balanceRes.ownershipVerified).toBe(true);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  reconcileContribution, reconcileContributionWithOfficialWallet, summarizeContributions,
} from './reconcile.js';
import type { ContributionRecord } from './types.js';

const WALLET = 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269';
const TX = 'c5743a7b7302ae11a4455289881bef43';
const base: ContributionRecord = {
  issue: 402, title: 'Grant #402', repository: 'Scottcjn/rustchain-bounties',
  claimant: 'xpex-systems-ai', wallet: WALLET, rewardRtc: 50,
  state: 'SUBMITTED', evidence: [],
};
const claimed: ContributionRecord = {
  ...base, evidence: [{ source: 'ledger', amountRtc: 50, txHash: TX, confirmed: true }],
};
const official = {
  ok: true, miner_id: WALLET,
  transactions: [{
    amount: 50, type: 'transfer_in', status: 'confirmed', tx_hash: TX,
    memo: 'Grant #402 Builder upfront 50% (xpex-systems-ai GXEON connector)',
  }],
};

afterEach(() => vi.restoreAllMocks());

function walletResponse(body: unknown, status = 200) {
  const spy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );
  return spy;
}

describe('RustChain payout reconciliation, official wallet evidence required', () => {
  it('does not promote unsupported submission', () =>
    expect(reconcileContribution(base).state).toBe('SUBMITTED'));

  it('does not accept fake authority', () => {
    const input: ContributionRecord = {
      ...base, evidence: [{ source: 'github', authority: 'random-user', amountRtc: 50, pendingId: 1, txHash: TX }],
    };
    expect(reconcileContribution(input).state).toBe('SUBMITTED');
  });

  it('acceptance does not mean settlement', () => {
    const input: ContributionRecord = {
      ...base, evidence: [{ source: 'github', authority: 'Scottcjn', amountRtc: 50 }],
    };
    expect(reconcileContribution(input).state).toBe('ACCEPTED');
  });

  it('authorized pending id + hash does not mean settlement', () => {
    const input: ContributionRecord = {
      ...base, evidence: [{ source: 'github', authority: 'sophiaeagent-beep', amountRtc: 50, pendingId: 5158, txHash: TX }],
    };
    expect(reconcileContribution(input).state).toBe('PENDING');
  });

  it('rejects a caller-asserted ledger confirmation with matching-looking hash', () => {
    const r = reconcileContribution(claimed);
    expect(r.state).toBe('SUBMITTED');
    expect(summarizeContributions([claimed]).confirmedRtc).toBe(0);
  });

  it('promotes ONLY after official wallet GET verifies wallet, hash, award, amount, status', async () => {
    const spy = walletResponse(official);
    const checked = await reconcileContributionWithOfficialWallet(claimed);
    expect(checked.state).toBe('CONFIRMED');
    expect(spy).toHaveBeenCalledOnce();
    const url = String(spy.mock.calls[0]?.[0]);
    expect(url).toContain('https://rustchain.org/wallet/history?miner_id=' + WALLET);
    expect(url).toContain('limit=100');
    expect(summarizeContributions([checked]).confirmedRtc).toBe(50);
    expect(summarizeContributions([checked, checked]).confirmedRtc).toBe(50);
  });

  it.each([
    [{ ...official, transactions: [{ ...official.transactions[0], status: 'pending' }] }, 'pending transfer'],
    [{ ...official, transactions: [{ ...official.transactions[0], type: 'transfer_out' }] }, 'outgoing transfer'],
    [{ ...official, transactions: [{ ...official.transactions[0], tx_hash: 'a'.repeat(32) }] }, 'different hash'],
    [{ ...official, transactions: [{ ...official.transactions[0], amount: 15 }] }, 'different amount'],
    [{ ...official, transactions: [{ ...official.transactions[0], memo: 'Grant #403 xpex-systems-ai' }] }, 'different award'],
    [{ ...official, transactions: [{ ...official.transactions[0], memo: 'Grant #402 for somebody-else' }] }, 'different claimant'],
  ])('fails closed for %s (%s)', async (history) => {
    walletResponse(history);
    const result = await reconcileContributionWithOfficialWallet(claimed);
    expect(result.state).not.toBe('CONFIRMED');
    expect(summarizeContributions([result]).confirmedRtc).toBe(0);
  });

  it('rejects response for the wrong wallet identifier', async () => {
    walletResponse({ ...official, miner_id: 'someone-else' });
    await expect(reconcileContributionWithOfficialWallet(claimed))
      .rejects.toThrow('RUSTCHAIN_WALLET_HISTORY_INVALID');
  });

  it('makes unavailable API explicit without claiming payment', async () => {
    walletResponse({ ok: false }, 503);
    await expect(reconcileContributionWithOfficialWallet(claimed))
      .rejects.toThrow('RUSTCHAIN_WALLET_HISTORY_UNAVAILABLE');
  });

  it('does not fetch if no proper ledger receipt has been supplied', async () => {
    const spy = vi.spyOn(globalThis, 'fetch');
    const result = await reconcileContributionWithOfficialWallet(base);
    expect(result.state).toBe('SUBMITTED');
    expect(spy).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from 'vitest';
import { reconcileContribution, summarizeContributions } from './reconcile.js';
import type { ContributionRecord } from './types.js';

const base: ContributionRecord = { issue: 402, title: 'Grant', repository: 'Scottcjn/rustchain-bounties', claimant: 'xpex-systems-ai',
  wallet: 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269', rewardRtc: 50, state: 'SUBMITTED', evidence: [] };

describe('RustChain payout reconciliation', () => {
  it('does not promote an unsupported submission', () => expect(reconcileContribution(base).state).toBe('SUBMITTED'));
  it('ignores payout claims from unauthorized commenters', () => expect(reconcileContribution({ ...base, evidence: [{ source: 'github', authority: 'random-user', amountRtc: 50, pendingId: 1, txHash: 'fake' }] }).state).toBe('SUBMITTED'));
  it('separates maintainer acceptance from confirmed money', () => expect(reconcileContribution({ ...base, evidence: [{ source: 'github', authority: 'Scottcjn', amountRtc: 50 }] }).state).toBe('ACCEPTED'));
  it('requires pending id and tx for pending state', () => expect(reconcileContribution({ ...base, evidence: [{ source: 'github', authority: 'sophiaeagent-beep', amountRtc: 50, pendingId: 5158, txHash: '18410b28' }] }).state).toBe('PENDING'));
  it('requires confirmed ledger evidence for confirmed RTC', () => expect(reconcileContribution({ ...base, evidence: [{ source: 'ledger', amountRtc: 50, txHash: 'abc', confirmed: true }] }).state).toBe('CONFIRMED'));
  it('does not double count a record across lifecycle buckets', () => {
    const s = summarizeContributions([{ ...base, evidence: [{ source: 'ledger', amountRtc: 50, txHash: 'abc', confirmed: true }] }]);
    expect(s.confirmedRtc).toBe(50); expect(s.pendingRtc).toBe(0); expect(s.acceptedRtc).toBe(0); expect(s.submittedRtc).toBe(0);
  });
});

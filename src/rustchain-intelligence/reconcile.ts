import type { ContributionRecord, ContributionState, ContributionSummary, RustChainEvidence } from './types.js';

const AUTHORIZED = new Set(['Scottcjn', 'sophiaeagent-beep']);

function authorityEvidence(evidence: RustChainEvidence[]): RustChainEvidence[] {
  return evidence.filter((item) => item.source === 'ledger' || (item.authority && AUTHORIZED.has(item.authority)));
}

function deriveState(record: ContributionRecord): ContributionState {
  const evidence = authorityEvidence(record.evidence);
  if (evidence.some((e) => e.source === 'ledger' && e.confirmed && e.txHash)) return 'CONFIRMED';
  if (evidence.some((e) => e.pendingId && e.txHash && e.amountRtc != null)) return 'PENDING';
  if (evidence.some((e) => e.authority && e.amountRtc != null)) return 'ACCEPTED';
  return record.state === 'SUBMITTED' ? 'SUBMITTED' : 'OPPORTUNITY';
}

export function reconcileContribution(input: ContributionRecord): ContributionRecord {
  return { ...input, state: deriveState(input) };
}

export function summarizeContributions(input: ContributionRecord[]): ContributionSummary {
  const records = input.map(reconcileContribution);
  const totals = { opportunityRtc: 0, submittedRtc: 0, acceptedRtc: 0, pendingRtc: 0, confirmedRtc: 0 };
  for (const item of records) {
    const amount = item.rewardRtc ?? 0;
    if (item.state === 'OPPORTUNITY') totals.opportunityRtc += amount;
    if (item.state === 'SUBMITTED') totals.submittedRtc += amount;
    if (item.state === 'ACCEPTED') totals.acceptedRtc += amount;
    if (item.state === 'PENDING') totals.pendingRtc += amount;
    if (item.state === 'CONFIRMED') totals.confirmedRtc += amount;
  }
  return { ...totals, records };
}

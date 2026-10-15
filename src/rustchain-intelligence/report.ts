import type { ContributionSummary } from './types.js';

export function renderContributionReport(summary: ContributionSummary): string {
  const lines = [
    '# GXEON RustChain Contribution & Payout Intelligence',
    '',
    'Read-only evidence report. Opportunity, submission, acceptance, pending payout and confirmed payout are intentionally separate.',
    '',
    '| State | RTC |',
    '|---|---:|',
    `| Opportunity | ${summary.opportunityRtc} |`,
    `| Submitted | ${summary.submittedRtc} |`,
    `| Accepted | ${summary.acceptedRtc} |`,
    `| Pending | ${summary.pendingRtc} |`,
    `| Confirmed | ${summary.confirmedRtc} |`,
    '',
    'Confirmed RTC requires an independently verified official RustChain wallet transfer matching wallet, transaction hash, credited amount and bounty/grant identity. Caller-asserted ledger flags, a claim, approval or pending transfer are never proof of payment.',
  ];
  return lines.join('\n');
}

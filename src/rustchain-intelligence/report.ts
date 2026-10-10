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
    'Confirmed RTC requires ledger evidence with a transaction hash. A claim, acceptance, pending id, or announced transfer is never counted as confirmed by itself.',
  ];
  return lines.join('\n');
}

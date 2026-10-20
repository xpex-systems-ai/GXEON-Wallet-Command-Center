export type ContributionState = 'OPPORTUNITY' | 'SUBMITTED' | 'ACCEPTED' | 'PENDING' | 'CONFIRMED';

export interface RustChainEvidence {
  source: 'github' | 'ledger';
  url?: string;
  authority?: string;
  pendingId?: number;
  txHash?: string;
  amountRtc?: number;
  confirmed?: boolean;
}

export interface ContributionRecord {
  issue: number;
  title: string;
  repository: string;
  claimant: string;
  wallet: string;
  rewardRtc: number | null;
  state: ContributionState;
  evidence: RustChainEvidence[];
}

export interface ContributionSummary {
  opportunityRtc: number;
  submittedRtc: number;
  acceptedRtc: number;
  pendingRtc: number;
  confirmedRtc: number;
  records: ContributionRecord[];
}

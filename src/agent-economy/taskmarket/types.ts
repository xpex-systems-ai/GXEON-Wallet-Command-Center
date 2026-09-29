export type TaskmarketAction = 'claim' | 'pitch' | 'bid' | 'submit';
export type MissionState = 'DISCOVERED' | 'QUALIFIED' | 'CLAIM_READY' | 'CLAIMED' | 'EXECUTING' | 'DELIVERY_READY' | 'SUBMITTED' | 'ACCEPTED' | 'SETTLEMENT_PENDING' | 'PAID' | 'REJECTED' | 'EXPIRED';

export interface PendingAction {
  role: string;
  action: string;
  eligibleAddress?: string | null;
  requiresPayment?: boolean;
  paymentAmount?: string | null;
  availableAfter?: string | null;
  availableUntil?: string | null;
}

export interface TaskmarketAward {
  workerAddress: string;
  workerPayment: string;
  grossAmount: string;
  platformFee: string;
  settlementTxHash: string;
  settledAt: string;
}

export interface TaskmarketTask {
  id: string;
  referenceCode?: string | null;
  description: string;
  requester: string;
  reward: string;
  netReward: string | null;
  escrowTxHash: string;
  createdAt: string;
  expiryTime: string;
  status: string;
  mode: 'claim' | 'pitch' | 'bounty' | 'benchmark' | 'auction';
  tags: string[];
  claimedBy: string | null;
  stakeRequired: boolean;
  stakeBps: number;
  platformFeeBps: number;
  submissionCount: number;
  pitchCount: number;
  auctionBidCount?: number | null;
  submissionWindowOpen: boolean;
  pitchDeadline: string | null;
  bidDeadline: string | null;
  pendingActions: PendingAction[];
  awards: TaskmarketAward[];
  hooks: string[];
  evaluator?: string | null;
}

export interface TaskmarketNetwork {
  chainId: 8453;
  currency: 'USDC';
  networkName: string;
  usdcAddress: string;
  contractAddress: string;
  verified: true;
}

export interface LegalBundle {
  version: string;
  bundleDigest: string;
  status: 'draft' | 'approved';
  enforcementEnabled: boolean;
  acceptanceAvailable: boolean;
  documents: Array<{ slug: string; title: string; version: string; contentHash: string; url: string }>;
  fetchedAt: string;
  acceptedAt: null;
  actor: null;
}

export interface RequesterStats {
  completedCount: number;
  selfAwardCount: number;
  cancelledAfterSubmissionsCount: number;
  expiredNoActionCount: number;
  expiredAfterRejectionsCount: number;
  totalTasksCreated: number;
  totalSubmissionAttempts: number;
  totalUniqueWorkers: number;
}

export interface FundingEvidence {
  verified: boolean;
  status: 'ONCHAIN_VERIFIED' | 'UNVERIFIED';
  transactionHash: string;
  blockNumber: string | null;
  checkedAt: string;
  reason: string | null;
}

export interface QualificationAssessment {
  // A signed-in operator's explicit review, stored separately from public task content.
  sourceHash: string;
  reviewedBy: string;
  reviewedAt: string;
  capability: 'gxeon_json_validate_v1' | 'gxeon_url_verify_v1';
  input: Record<string, unknown>;
  scopeVerified: boolean;
  safeContentVerified: boolean;
  criteriaVerified: boolean;
  hooksReviewed: boolean;
  submissionRequirements: { extensions: string[]; maxBytes: number };
  estimatedMinutes: number;
  estimatedExecutionCostUsdc: number;
  externalSpendUsdc: number;
}

export interface TaskmarketOpportunity {
  provider: 'taskmarket';
  externalId: string;
  taskId: string;
  title: string;
  description: string;
  url: string;
  requester: string;
  rewardUsdc: number;
  netRewardUsdc: number | null;
  taskMode: TaskmarketTask['mode'];
  status: string;
  state: MissionState;
  deadline: string;
  submissionRequirements: QualificationAssessment['submissionRequirements'] | null;
  requesterReputation: RequesterStats | null;
  claimed: boolean;
  competition: number;
  requiresSpend: boolean | null;
  requiresBond: boolean;
  requiresWalletSignature: true;
  fitScore: number;
  riskScore: number;
  expectedEffortMinutes: number | null;
  externalSpendUsdc: number | null;
  estimatedExecutionCostUsdc: number | null;
  probabilityOfAcceptance: null;
  expectedValue: null;
  expectedNetUsdc: null;
  expectedNetPerHour: null;
  maximumNetIfAcceptedUsdc: number | null;
  capabilitiesMatched: string[];
  rejectionReasons: string[];
  blockers: string[];
  recommendedAction: string;
  fundingStatus: FundingEvidence['status'];
  sourceEvidence: { apiUrl: string; sourceHash: string; escrow: FundingEvidence; legalDigest: string };
  fetchedAt: string;
}

export interface WorkerStatus {
  status: 'REGISTERED' | 'REGISTRATION_PENDING' | 'PUBLIC_ADDRESS_REQUIRED' | 'ERROR';
  walletAddress: string | null;
  registered: boolean | null;
  agentId: string | null;
  cacheFresh?: boolean;
  stats: { completedTasks: number; totalEarningsBaseUnits: string; averageRating: number | null; balanceBaseUnits: string | null } | null;
  error?: string;
}

export interface ActionPreview {
  taskId: string;
  action: TaskmarketAction;
  reward: number;
  externalSpend: number | null;
  bondUsdc: number;
  walletSignatureRequired: true;
  irreversible: true;
  approvalRequired: true;
  writeEnabled: boolean;
  actionAvailable: boolean;
  executable: false;
  reason: string[];
  commandPreview: string | null;
}

export interface ArtifactManifest {
  missionId: string;
  provider: 'taskmarket';
  taskId: string;
  sourceHash: string;
  startedAt: string;
  completedAt: string;
  files: Array<{ name: string; mimeType: string; sizeBytes: number; sha256: string }>;
  commandsRun: string[];
  tests: string[];
  testResults: Array<{ name: string; passed: boolean }>;
  outputHash: string;
  evidenceHash: string;
  submissionHash: string;
}

export interface TaskmarketSettlement {
  id: string;
  provider: 'taskmarket';
  taskId: string;
  amountBaseUnits: string;
  amountUsdc: number;
  currency: 'USDC';
  network: 'eip155:8453';
  workerAddress: string;
  transactionHash: string;
  blockNumber: string;
  settledAt: string;
  status: 'PAID';
  verified: true;
}

export interface TaskmarketSnapshot {
  provider: 'taskmarket';
  configured: true;
  apiReachable: boolean;
  networkVerified: boolean;
  legalFetched: boolean;
  network: TaskmarketNetwork | null;
  legal: LegalBundle | null;
  identity: WorkerStatus;
  identityRegistered: boolean | null;
  agentId: string | null;
  walletAddress: string | null;
  writeEnabled: boolean;
  openTasks: number;
  fundedTasksAvailable: number;
  qualifiedTasksAvailable: number;
  claimReady: number;
  activeClaims: number | null;
  submittedTasks: number | null;
  paidTasks: number | null;
  totalSettledUsdc: number | null;
  opportunities: TaskmarketOpportunity[];
  errors: string[];
  fetchedAt: string;
  openApiHash: string | null;
  persistence: 'DURABLE' | 'UNAVAILABLE';
  scheduler: { kind: 'github_actions_oidc'; cadence: string; lastSuccessfulPoll: string | null;
    health?: 'AWAITING_FIRST_POLL' | 'CURRENT' | 'DELAYED' | 'INVALID_TIMESTAMP'; ageSeconds?: number | null };
}

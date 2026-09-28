/**
 * GXEON Agent Economy V1 - Core Domain Types
 * Strict, type-safe data contracts for machine capability market.
 */

export type AgentScope =
  | 'services:read'
  | 'quotes:create'
  | 'jobs:create'
  | 'jobs:read'
  | 'results:read'
  | 'balance:read'
  | 'admin:*';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PAYMENT_REQUIRED' | 'CLOSED';
export type BillingMode = 'PREPAID_CREDITS' | 'METERED_ACCOUNT';

export interface AgentAccount {
  accountId: string;
  name: string;
  status: AccountStatus;
  billingMode: BillingMode;
  creditBalance: number;
  reservedCredits: number;
  spentCredits: number;
  spendingLimit: number;
  dailyLimit: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiKeyRecord {
  keyId: string;
  hashedKey: string;
  prefix: string;
  accountId: string;
  scopes: AgentScope[];
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export type ServiceStatus = 'DRAFT' | 'TESTING' | 'AVAILABLE' | 'PAUSED' | 'DEPRECATED';

export interface ServiceDefinition {
  serviceId: string;
  version: string;
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  unit: string;
  unitPriceCredits: number;
  minimumChargeCredits: number;
  maxBatch: number;
  timeoutMs: number;
  executionPolicy: string;
  riskClass: 'LOW' | 'MEDIUM' | 'HIGH';
  status: ServiceStatus;
}

export interface Quote {
  quoteId: string;
  serviceId: string;
  quantity: number;
  unitPriceCredits: number;
  totalCredits: number;
  expiresAt: string;
  quoteHash: string;
  accountId: string;
  createdAt: string;
}

export type JobState =
  | 'QUEUED'
  | 'RESOURCES_RESERVED'
  | 'EXECUTING'
  | 'VALIDATING'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED';

export type FinancialState = 'CREDITS_RESERVED' | 'CREDITS_SETTLED' | 'CREDITS_RELEASED';

export interface Job {
  jobId: string;
  accountId: string;
  serviceId: string;
  quoteId: string;
  state: JobState;
  financialState: FinancialState;
  input: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  failedReason?: string;
  workerId?: string;
  evidenceRecordId?: string;
  idempotencyKey?: string;
}

export interface JobResultSummary {
  total: number;
  healthy: number;
  failed: number;
}

export interface JobResult {
  jobId: string;
  serviceId: string;
  state: JobState;
  summary: JobResultSummary;
  results: unknown[];
  completedAt: string;
}

export type LedgerEntryType =
  | 'CREDIT'
  | 'RESERVE'
  | 'RELEASE'
  | 'DEBIT'
  | 'ADJUSTMENT'
  | 'REFUND';

export interface LedgerEntry {
  ledgerEntryId: string;
  accountId: string;
  jobId?: string;
  quoteId?: string;
  amountCredits: number;
  type: LedgerEntryType;
  balanceBefore: number;
  balanceAfter: number;
  timestamp: string;
  idempotencyKey?: string;
}

export type WorkerStatus = 'ONLINE' | 'DEGRADED' | 'OFFLINE';

export interface WorkerDefinition {
  workerId: string;
  capabilities: string[];
  status: WorkerStatus;
  health: number;
  maxConcurrency: number;
  currentLoad: number;
  successRate: number;
  averageLatencyMs: number;
  version: string;
}

export interface WorkerLease {
  leaseId: string;
  workerId: string;
  jobId: string;
  expiresAt: string;
  fencingToken: number;
}

export interface OutboxJob {
  outboxId: string;
  jobId: string;
  status: 'PENDING' | 'DISPATCHED' | 'FAILED' | 'COMPLETED';
  attemptCount: number;
  lastAttemptAt?: string;
  createdAt: string;
}

export interface EvidenceRecord {
  evidenceId: string;
  jobId: string;
  workerId: string;
  serviceVersion: string;
  inputHash: string;
  resultHash: string;
  executionStartedAt: string;
  executionCompletedAt: string;
  qaStatus: 'PASSED' | 'FAILED';
  billingSettlementId: string;
}

export type OpportunityStatus =
  | 'DISCOVERED'
  | 'QUALIFIED'
  | 'REJECTED'
  | 'WATCHING'
  | 'READY_FOR_OPERATOR';

export type DemandSignalKind =
  | 'SUPPLY_LISTING'
  | 'USAGE_SIGNAL'
  | 'DEMAND_LEAD'
  | 'FUNDED_JOB';

export interface DemandOpportunity {
  opportunityId: string;
  source: string;
  sourceRecordId?: string;
  sourceUrl: string;
  observedAt: string;
  kind: DemandSignalKind;
  title: string;
  summary: string;
  requiredCapability: string;
  priceCurrency?: string;
  statedPrice?: number;
  calls30d?: number;
  uniquePayers30d?: number;
  estimatedValue: number | null;
  fitScore: number;
  effortScore: number;
  riskScore: number;
  confidence: number;
  evidenceRef?: string;
  discoveredAt: string;
  expiresAt?: string;
  status: OpportunityStatus;
}

export type GxeonErrorCode =
  | 'AUTH_REQUIRED'
  | 'INVALID_API_KEY'
  | 'SCOPE_DENIED'
  | 'RATE_LIMITED'
  | 'SERVICE_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_INPUT'
  | 'QUOTE_EXPIRED'
  | 'QUOTE_INVALID'
  | 'QUANTITY_MISMATCH'
  | 'INSUFFICIENT_CREDITS'
  | 'ACCOUNT_SUSPENDED'
  | 'JOB_NOT_FOUND'
  | 'JOB_FAILED'
  | 'SSRF_BLOCKED'
  | 'IDEMPOTENCY_CONFLICT'
  | 'INTERNAL_ERROR';

export interface GxeonErrorResponse {
  error: {
    code: GxeonErrorCode;
    message: string;
    requestId?: string;
    details?: unknown;
  };
}

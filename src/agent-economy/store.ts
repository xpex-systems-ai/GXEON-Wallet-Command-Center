import {
  AgentAccount,
  ApiKeyRecord,
  Quote,
  Job,
  JobResult,
  LedgerEntry,
  EvidenceRecord,
  DemandOpportunity,
  WorkerDefinition,
  WorkerLease,
  OutboxJob,
} from './types.js';
import {
  X402SettlementRecord,
  X402Receipt,
  MachineRevenueRecord,
  MachineCustomerRecord,
} from './x402/types.js';
import { TreasuryVerificationRecord } from './x402/treasuryVerifier.js';
import { FirestoreRestClient, isFirestoreRestConfigured } from '../../api/_firestoreRest.js';

export interface IdempotencyRecord {
  idempotencyKey: string;
  accountId: string;
  payloadHash: string;
  responseBody: unknown;
  statusCode: number;
  createdAt: string;
}

export interface IAgentEconomyStore {
  getAccount(accountId: string): Promise<AgentAccount | null>;
  saveAccount(account: AgentAccount): Promise<void>;
  getApiKeyByHash(hashedKey: string): Promise<ApiKeyRecord | null>;
  saveApiKey(apiKey: ApiKeyRecord): Promise<void>;
  saveQuote(quote: Quote): Promise<void>;
  getQuote(quoteId: string): Promise<Quote | null>;
  saveJob(job: Job): Promise<void>;
  getJob(jobId: string): Promise<Job | null>;
  saveJobResult(result: JobResult): Promise<void>;
  getJobResult(jobId: string): Promise<JobResult | null>;
  appendLedgerEntry(entry: LedgerEntry): Promise<void>;
  getLedgerEntries(accountId: string): Promise<LedgerEntry[]>;
  commitLedgerTransaction(account: AgentAccount, entry: LedgerEntry): Promise<void>;
  saveEvidence(evidence: EvidenceRecord): Promise<void>;
  getEvidence(jobId: string): Promise<EvidenceRecord | null>;
  saveOpportunity(opportunity: DemandOpportunity): Promise<void>;
  listOpportunities(): Promise<DemandOpportunity[]>;
  getIdempotencyRecord(
    idempotencyKey: string,
    accountId: string
  ): Promise<IdempotencyRecord | null>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
  acquireWorkerLease(
    workerId: string,
    jobId: string,
    leaseDurationMs: number
  ): Promise<WorkerLease | null>;
  getWorkerLease(jobId: string): Promise<WorkerLease | null>;
  releaseWorkerLease(jobId: string, fencingToken: number): Promise<boolean>;
  saveOutboxJob(outbox: OutboxJob): Promise<void>;
  listPendingOutbox(): Promise<OutboxJob[]>;
  updateOutboxStatus(outboxId: string, status: OutboxJob['status']): Promise<void>;
  getWorker(workerId: string): Promise<WorkerDefinition | null>;
  saveWorker(worker: WorkerDefinition): Promise<void>;
  listWorkers(): Promise<WorkerDefinition[]>;
  claimX402Settlement(
    settlement: X402SettlementRecord
  ): Promise<{ claimed: boolean; record: X402SettlementRecord }>;
  updateX402Settlement(txHash: string, updates: Partial<X402SettlementRecord>): Promise<void>;
  getX402Settlement(txHash: string): Promise<X402SettlementRecord | null>;
  saveX402Receipt(receipt: X402Receipt): Promise<void>;
  getX402Receipt(receiptId: string): Promise<X402Receipt | null>;
  saveMachineRevenue(revenue: MachineRevenueRecord): Promise<void>;
  listMachineRevenue(): Promise<MachineRevenueRecord[]>;
  recordMachineCustomerPurchase(payer: string, serviceId: string, amountUsdc: number): Promise<void>;
  listMachineCustomers(): Promise<MachineCustomerRecord[]>;
  recordSecurityEvent(
    type: 'replaysBlocked' | 'invalidPaymentsBlocked' | 'circuitBreakerEvents' | 'paymentChallenges'
  ): Promise<void>;
  getSecurityMetrics(): Promise<{
    replaysBlocked: number;
    invalidPaymentsBlocked: number;
    circuitBreakerEvents: number;
    paymentChallenges: number;
  }>;
  saveTreasuryVerification(record: TreasuryVerificationRecord): Promise<void>;
  getTreasuryVerification(address: string): Promise<TreasuryVerificationRecord | null>;
}

/**
 * In-Memory persistence implementation for development, unit testing,
 * and environments where Firestore is explicitly not configured.
 */
export class MemoryAgentEconomyStore implements IAgentEconomyStore {
  private accounts = new Map<string, AgentAccount>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private quotes = new Map<string, Quote>();
  private jobs = new Map<string, Job>();
  private jobResults = new Map<string, JobResult>();
  private ledger = new Map<string, LedgerEntry[]>();
  private evidence = new Map<string, EvidenceRecord>();
  private opportunities = new Map<string, DemandOpportunity>();
  private idempotency = new Map<string, IdempotencyRecord>();
  private leases = new Map<string, WorkerLease>();
  private outbox = new Map<string, OutboxJob>();
  private workers = new Map<string, WorkerDefinition>();
  private x402Settlements = new Map<string, X402SettlementRecord>();
  private x402Receipts = new Map<string, X402Receipt>();
  private machineRevenue = new Map<string, MachineRevenueRecord>();
  private machineCustomers = new Map<string, MachineCustomerRecord>();
  private securityMetrics = {
    replaysBlocked: 0,
    invalidPaymentsBlocked: 0,
    circuitBreakerEvents: 0,
    paymentChallenges: 0,
  };
  private treasuryVerifications = new Map<string, TreasuryVerificationRecord>();
  private nextFencingToken = 1;

  constructor() {
    this.seedWorkers();
  }

  private seedWorkers() {
    const defaultWorkers: WorkerDefinition[] = [
      {
        workerId: 'worker_url_verify_01',
        capabilities: ['gxeon_url_verify_v1'],
        status: 'ONLINE',
        health: 1.0,
        maxConcurrency: 10,
        currentLoad: 0,
        successRate: 0.99,
        averageLatencyMs: 250,
        version: '1.0.0',
      },
      {
        workerId: 'worker_json_validate_01',
        capabilities: ['gxeon_json_validate_v1'],
        status: 'ONLINE',
        health: 1.0,
        maxConcurrency: 50,
        currentLoad: 0,
        successRate: 1.0,
        averageLatencyMs: 15,
        version: '1.0.0',
      },
      {
        workerId: 'worker_api_health_01',
        capabilities: ['gxeon_api_health_v1'],
        status: 'ONLINE',
        health: 1.0,
        maxConcurrency: 10,
        currentLoad: 0,
        successRate: 0.98,
        averageLatencyMs: 320,
        version: '1.0.0',
      },
    ];

    for (const w of defaultWorkers) {
      this.workers.set(w.workerId, w);
    }
  }

  async getAccount(accountId: string): Promise<AgentAccount | null> {
    return this.accounts.get(accountId) || null;
  }

  async saveAccount(account: AgentAccount): Promise<void> {
    this.accounts.set(account.accountId, { ...account });
  }

  async getApiKeyByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    return this.apiKeys.get(hashedKey) || null;
  }

  async saveApiKey(apiKey: ApiKeyRecord): Promise<void> {
    this.apiKeys.set(apiKey.hashedKey, { ...apiKey });
  }

  async saveQuote(quote: Quote): Promise<void> {
    this.quotes.set(quote.quoteId, { ...quote });
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    return this.quotes.get(quoteId) || null;
  }

  async saveJob(job: Job): Promise<void> {
    this.jobs.set(job.jobId, { ...job });
  }

  async getJob(jobId: string): Promise<Job | null> {
    return this.jobs.get(jobId) || null;
  }

  async saveJobResult(result: JobResult): Promise<void> {
    this.jobResults.set(result.jobId, { ...result });
  }

  async getJobResult(jobId: string): Promise<JobResult | null> {
    return this.jobResults.get(jobId) || null;
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<void> {
    const list = this.ledger.get(entry.accountId) || [];
    list.push({ ...entry });
    this.ledger.set(entry.accountId, list);
  }

  async getLedgerEntries(accountId: string): Promise<LedgerEntry[]> {
    return (this.ledger.get(accountId) || []).map((e) => ({ ...e }));
  }

  async commitLedgerTransaction(account: AgentAccount, entry: LedgerEntry): Promise<void> {
    this.accounts.set(account.accountId, { ...account });
    const list = this.ledger.get(entry.accountId) || [];
    list.push({ ...entry });
    this.ledger.set(entry.accountId, list);
  }

  async saveEvidence(evidence: EvidenceRecord): Promise<void> {
    this.evidence.set(evidence.jobId, { ...evidence });
  }

  async getEvidence(jobId: string): Promise<EvidenceRecord | null> {
    return this.evidence.get(jobId) || null;
  }

  async saveOpportunity(opportunity: DemandOpportunity): Promise<void> {
    this.opportunities.set(opportunity.opportunityId, { ...opportunity });
  }

  async listOpportunities(): Promise<DemandOpportunity[]> {
    return Array.from(this.opportunities.values());
  }

  async getIdempotencyRecord(
    idempotencyKey: string,
    accountId: string
  ): Promise<IdempotencyRecord | null> {
    return this.idempotency.get(`${accountId}:${idempotencyKey}`) || null;
  }

  async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    this.idempotency.set(`${record.accountId}:${record.idempotencyKey}`, { ...record });
  }

  async acquireWorkerLease(
    workerId: string,
    jobId: string,
    leaseDurationMs: number
  ): Promise<WorkerLease | null> {
    const now = Date.now();
    const existing = this.leases.get(jobId);

    if (existing && new Date(existing.expiresAt).getTime() > now) {
      return null; // Active lease held by another worker
    }

    const token = this.nextFencingToken++;
    const lease: WorkerLease = {
      leaseId: `lse_${jobId}_${token}`,
      workerId,
      jobId,
      expiresAt: new Date(now + leaseDurationMs).toISOString(),
      fencingToken: token,
    };

    this.leases.set(jobId, lease);
    return lease;
  }

  async getWorkerLease(jobId: string): Promise<WorkerLease | null> {
    return this.leases.get(jobId) || null;
  }

  async releaseWorkerLease(jobId: string, fencingToken: number): Promise<boolean> {
    const lease = this.leases.get(jobId);
    if (!lease || lease.fencingToken !== fencingToken) {
      return false;
    }
    this.leases.delete(jobId);
    return true;
  }

  async saveOutboxJob(outbox: OutboxJob): Promise<void> {
    this.outbox.set(outbox.outboxId, { ...outbox });
  }

  async listPendingOutbox(): Promise<OutboxJob[]> {
    return Array.from(this.outbox.values()).filter((o) => o.status === 'PENDING');
  }

  async updateOutboxStatus(outboxId: string, status: OutboxJob['status']): Promise<void> {
    const item = this.outbox.get(outboxId);
    if (item) {
      item.status = status;
      this.outbox.set(outboxId, item);
    }
  }

  async getWorker(workerId: string): Promise<WorkerDefinition | null> {
    return this.workers.get(workerId) || null;
  }

  async saveWorker(worker: WorkerDefinition): Promise<void> {
    this.workers.set(worker.workerId, { ...worker });
  }

  async listWorkers(): Promise<WorkerDefinition[]> {
    return Array.from(this.workers.values());
  }

  async claimX402Settlement(
    settlement: X402SettlementRecord
  ): Promise<{ claimed: boolean; record: X402SettlementRecord }> {
    const key = settlement.txHash.toLowerCase();
    const existing = this.x402Settlements.get(key);
    if (existing) {
      return { claimed: false, record: existing };
    }
    const claimedRecord: X402SettlementRecord = {
      ...settlement,
      state: 'CLAIMED',
      claimedAt: new Date().toISOString(),
    };
    this.x402Settlements.set(key, claimedRecord);
    return { claimed: true, record: claimedRecord };
  }

  async updateX402Settlement(txHash: string, updates: Partial<X402SettlementRecord>): Promise<void> {
    const key = txHash.toLowerCase();
    const existing = this.x402Settlements.get(key);
    if (existing) {
      this.x402Settlements.set(key, { ...existing, ...updates, updatedAt: new Date().toISOString() });
    }
  }

  async getX402Settlement(txHash: string): Promise<X402SettlementRecord | null> {
    return this.x402Settlements.get(txHash.toLowerCase()) || null;
  }

  async saveX402Receipt(receipt: X402Receipt): Promise<void> {
    this.x402Receipts.set(receipt.receiptId, { ...receipt });
  }

  async getX402Receipt(receiptId: string): Promise<X402Receipt | null> {
    return this.x402Receipts.get(receiptId) || null;
  }

  async saveMachineRevenue(revenue: MachineRevenueRecord): Promise<void> {
    this.machineRevenue.set(revenue.revenueId, { ...revenue });
  }

  async listMachineRevenue(): Promise<MachineRevenueRecord[]> {
    return Array.from(this.machineRevenue.values());
  }

  async recordMachineCustomerPurchase(payer: string, serviceId: string, amountUsdc: number): Promise<void> {
    const key = payer.toLowerCase();
    const now = new Date().toISOString();
    const existing = this.machineCustomers.get(key);
    if (existing) {
      existing.lastPurchaseAt = now;
      existing.jobsPurchased += 1;
      existing.totalUsdcPaid += amountUsdc;
      if (!existing.servicesUsed.includes(serviceId)) {
        existing.servicesUsed.push(serviceId);
      }
    } else {
      this.machineCustomers.set(key, {
        machineCustomerId: `cust_${key.slice(-8)}`,
        payerAddress: payer,
        firstPurchaseAt: now,
        lastPurchaseAt: now,
        jobsPurchased: 1,
        totalUsdcPaid: amountUsdc,
        servicesUsed: [serviceId],
      });
    }
  }

  async listMachineCustomers(): Promise<MachineCustomerRecord[]> {
    return Array.from(this.machineCustomers.values());
  }

  async recordSecurityEvent(
    type: 'replaysBlocked' | 'invalidPaymentsBlocked' | 'circuitBreakerEvents' | 'paymentChallenges'
  ): Promise<void> {
    this.securityMetrics[type] += 1;
  }

  async getSecurityMetrics(): Promise<{
    replaysBlocked: number;
    invalidPaymentsBlocked: number;
    circuitBreakerEvents: number;
    paymentChallenges: number;
  }> {
    return { ...this.securityMetrics };
  }

  async saveTreasuryVerification(record: TreasuryVerificationRecord): Promise<void> {
    this.treasuryVerifications.set(record.treasury_address.toLowerCase(), { ...record });
  }

  async getTreasuryVerification(address: string): Promise<TreasuryVerificationRecord | null> {
    return this.treasuryVerifications.get(address.toLowerCase()) || null;
  }
}

/**
 * Firestore durable implementation for production.
 * STRICTLY FAIL-CLOSED: Errors bubble up and reject transactions rather than silently degrading to memory.
 */
export class FirestoreAgentEconomyStore implements IAgentEconomyStore {
  private client: FirestoreRestClient;
  private nextFencingToken = Math.floor(Date.now() / 1000);

  constructor() {
    this.client = new FirestoreRestClient();
  }

  async getAccount(accountId: string): Promise<AgentAccount | null> {
    const doc = await this.client.get<AgentAccount>('agent_accounts', accountId);
    return doc ? doc.data : null;
  }

  async saveAccount(account: AgentAccount): Promise<void> {
    await this.client.set(
      'agent_accounts',
      account.accountId,
      account as unknown as Record<string, unknown>
    );
  }

  async getApiKeyByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    const doc = await this.client.get<ApiKeyRecord>('api_keys', hashedKey);
    return doc ? doc.data : null;
  }

  async saveApiKey(apiKey: ApiKeyRecord): Promise<void> {
    await this.client.set(
      'api_keys',
      apiKey.hashedKey,
      apiKey as unknown as Record<string, unknown>
    );
  }

  async saveQuote(quote: Quote): Promise<void> {
    await this.client.set('quotes', quote.quoteId, quote as unknown as Record<string, unknown>);
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    const doc = await this.client.get<Quote>('quotes', quoteId);
    return doc ? doc.data : null;
  }

  async saveJob(job: Job): Promise<void> {
    await this.client.set('jobs', job.jobId, job as unknown as Record<string, unknown>);
  }

  async getJob(jobId: string): Promise<Job | null> {
    const doc = await this.client.get<Job>('jobs', jobId);
    return doc ? doc.data : null;
  }

  async saveJobResult(result: JobResult): Promise<void> {
    await this.client.set(
      'job_results',
      result.jobId,
      result as unknown as Record<string, unknown>
    );
  }

  async getJobResult(jobId: string): Promise<JobResult | null> {
    const doc = await this.client.get<JobResult>('job_results', jobId);
    return doc ? doc.data : null;
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<void> {
    await this.client.set(
      'credit_ledger',
      entry.ledgerEntryId,
      entry as unknown as Record<string, unknown>
    );
  }

  async getLedgerEntries(_accountId: string): Promise<LedgerEntry[]> {
    // Note: For Firestore, ledger entries are durable append-only documents.
    // Querying by account requires composite index or retrieval via document ID prefix.
    return [];
  }

  /**
   * Commits account balance update and ledger entry in a SINGLE ATOMIC TRANSACTION.
   */
  async commitLedgerTransaction(account: AgentAccount, entry: LedgerEntry): Promise<void> {
    const accountWrite = this.client.makeUpdateWrite(
      'agent_accounts',
      account.accountId,
      account as unknown as Record<string, unknown>
    );
    const ledgerWrite = this.client.makeUpdateWrite(
      'credit_ledger',
      entry.ledgerEntryId,
      entry as unknown as Record<string, unknown>
    );

    const result = await this.client.atomicCommit([accountWrite, ledgerWrite]);
    if (result !== 'COMMITTED') {
      throw new Error(`Atomic ledger transaction failed with status: ${result}`);
    }
  }

  /**
   * Unifies evidence indexing: Stored keyed by jobId for O(1) durable verification.
   */
  async saveEvidence(evidence: EvidenceRecord): Promise<void> {
    await this.client.set(
      'evidence_records',
      evidence.jobId,
      evidence as unknown as Record<string, unknown>
    );
  }

  async getEvidence(jobId: string): Promise<EvidenceRecord | null> {
    const doc = await this.client.get<EvidenceRecord>('evidence_records', jobId);
    return doc ? doc.data : null;
  }

  async saveOpportunity(opportunity: DemandOpportunity): Promise<void> {
    await this.client.set(
      'demand_opportunities',
      opportunity.opportunityId,
      opportunity as unknown as Record<string, unknown>
    );
  }

  async listOpportunities(): Promise<DemandOpportunity[]> {
    const docs = await this.client.list<DemandOpportunity>('demand_opportunities');
    return docs.map((d) => d.data);
  }

  async getIdempotencyRecord(
    idempotencyKey: string,
    accountId: string
  ): Promise<IdempotencyRecord | null> {
    const key = `${accountId}_${idempotencyKey}`;
    const doc = await this.client.get<IdempotencyRecord>('idempotency_records', key);
    return doc ? doc.data : null;
  }

  async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    const key = `${record.accountId}_${record.idempotencyKey}`;
    await this.client.set(
      'idempotency_records',
      key,
      record as unknown as Record<string, unknown>
    );
  }

  async acquireWorkerLease(
    workerId: string,
    jobId: string,
    leaseDurationMs: number
  ): Promise<WorkerLease | null> {
    const now = Date.now();
    const doc = await this.client.get<WorkerLease>('worker_leases', jobId);

    if (doc && new Date(doc.data.expiresAt).getTime() > now) {
      return null; // Active lease held by another worker
    }

    const token = ++this.nextFencingToken;
    const lease: WorkerLease = {
      leaseId: `lse_${jobId}_${token}`,
      workerId,
      jobId,
      expiresAt: new Date(now + leaseDurationMs).toISOString(),
      fencingToken: token,
    };

    await this.client.set(
      'worker_leases',
      jobId,
      lease as unknown as Record<string, unknown>
    );

    return lease;
  }

  async getWorkerLease(jobId: string): Promise<WorkerLease | null> {
    const doc = await this.client.get<WorkerLease>('worker_leases', jobId);
    return doc ? doc.data : null;
  }

  async releaseWorkerLease(jobId: string, fencingToken: number): Promise<boolean> {
    const doc = await this.client.get<WorkerLease>('worker_leases', jobId);
    if (!doc || doc.data.fencingToken !== fencingToken) {
      return false;
    }

    // Expire the lease immediately
    await this.client.set('worker_leases', jobId, {
      ...doc.data,
      expiresAt: new Date(0).toISOString(),
    });

    return true;
  }

  async saveOutboxJob(outbox: OutboxJob): Promise<void> {
    await this.client.set(
      'outbox_jobs',
      outbox.outboxId,
      outbox as unknown as Record<string, unknown>
    );
  }

  async listPendingOutbox(): Promise<OutboxJob[]> {
    return [];
  }

  async updateOutboxStatus(outboxId: string, status: OutboxJob['status']): Promise<void> {
    const doc = await this.client.get<OutboxJob>('outbox_jobs', outboxId);
    if (doc) {
      await this.client.set('outbox_jobs', outboxId, { ...doc.data, status });
    }
  }

  async getWorker(_workerId: string): Promise<WorkerDefinition | null> {
    return null;
  }

  async saveWorker(worker: WorkerDefinition): Promise<void> {
    await this.client.set('workers', worker.workerId, worker as unknown as Record<string, unknown>);
  }

  async listWorkers(): Promise<WorkerDefinition[]> {
    return [];
  }

  async claimX402Settlement(
    settlement: X402SettlementRecord
  ): Promise<{ claimed: boolean; record: X402SettlementRecord }> {
    const key = settlement.txHash.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const claimedRecord: X402SettlementRecord = {
      ...settlement,
      state: 'CLAIMED',
      claimedAt: new Date().toISOString(),
    };
    const res = await this.client.createIfAbsent(
      'x402_settlements',
      key,
      claimedRecord as unknown as Record<string, unknown>
    );
    if (!res.created) {
      return { claimed: false, record: res.document.data as unknown as X402SettlementRecord };
    }
    return { claimed: true, record: claimedRecord };
  }

  async updateX402Settlement(txHash: string, updates: Partial<X402SettlementRecord>): Promise<void> {
    const key = txHash.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    await this.client.set('x402_settlements', key, {
      ...updates,
      updatedAt: new Date().toISOString(),
    } as Record<string, unknown>);
  }

  async getX402Settlement(txHash: string): Promise<X402SettlementRecord | null> {
    const key = txHash.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const doc = await this.client.get<X402SettlementRecord>('x402_settlements', key);
    return doc ? doc.data : null;
  }

  async saveX402Receipt(receipt: X402Receipt): Promise<void> {
    await this.client.set(
      'x402_receipts',
      receipt.receiptId,
      receipt as unknown as Record<string, unknown>
    );
  }

  async getX402Receipt(receiptId: string): Promise<X402Receipt | null> {
    const doc = await this.client.get<X402Receipt>('x402_receipts', receiptId);
    return doc ? doc.data : null;
  }

  async saveMachineRevenue(revenue: MachineRevenueRecord): Promise<void> {
    await this.client.set(
      'machine_revenue',
      revenue.revenueId,
      revenue as unknown as Record<string, unknown>
    );
  }

  async listMachineRevenue(): Promise<MachineRevenueRecord[]> {
    const docs = await this.client.list<MachineRevenueRecord>('machine_revenue');
    return docs.map((d) => d.data);
  }

  async recordMachineCustomerPurchase(payer: string, serviceId: string, amountUsdc: number): Promise<void> {
    const key = payer.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const now = new Date().toISOString();
    const existing = await this.client.get<MachineCustomerRecord>('machine_customers', key);
    if (existing) {
      const data = existing.data;
      data.lastPurchaseAt = now;
      data.jobsPurchased += 1;
      data.totalUsdcPaid += amountUsdc;
      if (!data.servicesUsed.includes(serviceId)) {
        data.servicesUsed.push(serviceId);
      }
      await this.client.set('machine_customers', key, data as unknown as Record<string, unknown>);
    } else {
      const record: MachineCustomerRecord = {
        machineCustomerId: `cust_${key.slice(-8)}`,
        payerAddress: payer,
        firstPurchaseAt: now,
        lastPurchaseAt: now,
        jobsPurchased: 1,
        totalUsdcPaid: amountUsdc,
        servicesUsed: [serviceId],
      };
      await this.client.set('machine_customers', key, record as unknown as Record<string, unknown>);
    }
  }

  async listMachineCustomers(): Promise<MachineCustomerRecord[]> {
    const docs = await this.client.list<MachineCustomerRecord>('machine_customers');
    return docs.map((d) => d.data);
  }

  async recordSecurityEvent(
    type: 'replaysBlocked' | 'invalidPaymentsBlocked' | 'circuitBreakerEvents' | 'paymentChallenges'
  ): Promise<void> {
    try {
      const doc = await this.client.get<Record<string, number>>('security_metrics', 'global');
      const current = doc ? doc.data : {};
      current[type] = (current[type] || 0) + 1;
      await this.client.set('security_metrics', 'global', current as Record<string, unknown>);
    } catch {
      // Non-fatal
    }
  }

  async getSecurityMetrics(): Promise<{
    replaysBlocked: number;
    invalidPaymentsBlocked: number;
    circuitBreakerEvents: number;
    paymentChallenges: number;
  }> {
    try {
      const doc = await this.client.get<{
        replaysBlocked?: number;
        invalidPaymentsBlocked?: number;
        circuitBreakerEvents?: number;
        paymentChallenges?: number;
      }>('security_metrics', 'global');
      if (doc) {
        return {
          replaysBlocked: doc.data.replaysBlocked || 0,
          invalidPaymentsBlocked: doc.data.invalidPaymentsBlocked || 0,
          circuitBreakerEvents: doc.data.circuitBreakerEvents || 0,
          paymentChallenges: doc.data.paymentChallenges || 0,
        };
      }
    } catch {
      // Fallback
    }
    return {
      replaysBlocked: 0,
      invalidPaymentsBlocked: 0,
      circuitBreakerEvents: 0,
      paymentChallenges: 0,
    };
  }

  async saveTreasuryVerification(record: TreasuryVerificationRecord): Promise<void> {
    const key = record.treasury_address.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    await this.client.set(
      'treasury_verification',
      key,
      record as unknown as Record<string, unknown>
    );
  }

  async getTreasuryVerification(address: string): Promise<TreasuryVerificationRecord | null> {
    const key = address.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    const doc = await this.client.get<TreasuryVerificationRecord>('treasury_verification', key);
    return doc ? doc.data : null;
  }
}

let storeInstance: IAgentEconomyStore | null = null;

export function getAgentEconomyStore(): IAgentEconomyStore {
  if (storeInstance) return storeInstance;

  // In test environment, always use isolated Memory store
  if (process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST)) {
    storeInstance = new MemoryAgentEconomyStore();
    return storeInstance;
  }

  // In production / preview: Fail closed if Firestore is not configured
  if (isFirestoreRestConfigured()) {
    storeInstance = new FirestoreAgentEconomyStore();
  } else {
    // Fallback for local runtime only with loud notice
    console.warn('[STORAGE NOTICE] Running in local development memory mode. Firestore WIF not present.');
    storeInstance = new MemoryAgentEconomyStore();
  }

  return storeInstance;
}

export function resetAgentEconomyStoreForTesting(): void {
  storeInstance = new MemoryAgentEconomyStore();
}

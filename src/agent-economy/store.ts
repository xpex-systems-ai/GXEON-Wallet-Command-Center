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
} from './types.js';
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
  saveEvidence(evidence: EvidenceRecord): Promise<void>;
  getEvidence(jobId: string): Promise<EvidenceRecord | null>;
  saveOpportunity(opportunity: DemandOpportunity): Promise<void>;
  listOpportunities(): Promise<DemandOpportunity[]>;
  getIdempotencyRecord(
    idempotencyKey: string,
    accountId: string
  ): Promise<IdempotencyRecord | null>;
  saveIdempotencyRecord(record: IdempotencyRecord): Promise<void>;
  getWorker(workerId: string): Promise<WorkerDefinition | null>;
  saveWorker(worker: WorkerDefinition): Promise<void>;
  listWorkers(): Promise<WorkerDefinition[]>;
}

/**
 * In-Memory persistence implementation for development, unit testing,
 * and environments where Firestore is not configured.
 */
class MemoryAgentEconomyStore implements IAgentEconomyStore {
  private accounts = new Map<string, AgentAccount>();
  private apiKeys = new Map<string, ApiKeyRecord>();
  private quotes = new Map<string, Quote>();
  private jobs = new Map<string, Job>();
  private jobResults = new Map<string, JobResult>();
  private ledger = new Map<string, LedgerEntry[]>();
  private evidence = new Map<string, EvidenceRecord>();
  private opportunities = new Map<string, DemandOpportunity>();
  private idempotency = new Map<string, IdempotencyRecord>();
  private workers = new Map<string, WorkerDefinition>();

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

  async getWorker(workerId: string): Promise<WorkerDefinition | null> {
    return this.workers.get(workerId) || null;
  }

  async saveWorker(worker: WorkerDefinition): Promise<void> {
    this.workers.set(worker.workerId, { ...worker });
  }

  async listWorkers(): Promise<WorkerDefinition[]> {
    return Array.from(this.workers.values());
  }
}

/**
 * Firestore durable implementation for production.
 */
class FirestoreAgentEconomyStore implements IAgentEconomyStore {
  private client: FirestoreRestClient;
  private fallbackMemory: MemoryAgentEconomyStore;

  constructor() {
    this.client = new FirestoreRestClient();
    this.fallbackMemory = new MemoryAgentEconomyStore();
  }

  async getAccount(accountId: string): Promise<AgentAccount | null> {
    try {
      const doc = await this.client.get<AgentAccount>('agent_accounts', accountId);
      return doc ? doc.data : null;
    } catch {
      return this.fallbackMemory.getAccount(accountId);
    }
  }

  async saveAccount(account: AgentAccount): Promise<void> {
    await this.fallbackMemory.saveAccount(account);
    try {
      await this.client.set('agent_accounts', account.accountId, account as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync account to Firestore:', err);
    }
  }

  async getApiKeyByHash(hashedKey: string): Promise<ApiKeyRecord | null> {
    try {
      const doc = await this.client.get<ApiKeyRecord>('api_keys', hashedKey);
      if (doc) return doc.data;
    } catch {
      // Fallback
    }
    return this.fallbackMemory.getApiKeyByHash(hashedKey);
  }

  async saveApiKey(apiKey: ApiKeyRecord): Promise<void> {
    await this.fallbackMemory.saveApiKey(apiKey);
    try {
      await this.client.set('api_keys', apiKey.hashedKey, apiKey as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync api_key to Firestore:', err);
    }
  }

  async saveQuote(quote: Quote): Promise<void> {
    await this.fallbackMemory.saveQuote(quote);
    try {
      await this.client.set('quotes', quote.quoteId, quote as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync quote to Firestore:', err);
    }
  }

  async getQuote(quoteId: string): Promise<Quote | null> {
    try {
      const doc = await this.client.get<Quote>('quotes', quoteId);
      if (doc) return doc.data;
    } catch {
      // Fallback
    }
    return this.fallbackMemory.getQuote(quoteId);
  }

  async saveJob(job: Job): Promise<void> {
    await this.fallbackMemory.saveJob(job);
    try {
      await this.client.set('jobs', job.jobId, job as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync job to Firestore:', err);
    }
  }

  async getJob(jobId: string): Promise<Job | null> {
    try {
      const doc = await this.client.get<Job>('jobs', jobId);
      if (doc) return doc.data;
    } catch {
      // Fallback
    }
    return this.fallbackMemory.getJob(jobId);
  }

  async saveJobResult(result: JobResult): Promise<void> {
    await this.fallbackMemory.saveJobResult(result);
    try {
      await this.client.set('job_results', result.jobId, result as unknown as Record<string, unknown>);
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync job_result to Firestore:', err);
    }
  }

  async getJobResult(jobId: string): Promise<JobResult | null> {
    try {
      const doc = await this.client.get<JobResult>('job_results', jobId);
      if (doc) return doc.data;
    } catch {
      // Fallback
    }
    return this.fallbackMemory.getJobResult(jobId);
  }

  async appendLedgerEntry(entry: LedgerEntry): Promise<void> {
    await this.fallbackMemory.appendLedgerEntry(entry);
    try {
      await this.client.set(
        'credit_ledger',
        entry.ledgerEntryId,
        entry as unknown as Record<string, unknown>
      );
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync ledger to Firestore:', err);
    }
  }

  async getLedgerEntries(accountId: string): Promise<LedgerEntry[]> {
    return this.fallbackMemory.getLedgerEntries(accountId);
  }

  async saveEvidence(evidence: EvidenceRecord): Promise<void> {
    await this.fallbackMemory.saveEvidence(evidence);
    try {
      await this.client.set(
        'evidence_records',
        evidence.evidenceId,
        evidence as unknown as Record<string, unknown>
      );
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync evidence to Firestore:', err);
    }
  }

  async getEvidence(jobId: string): Promise<EvidenceRecord | null> {
    try {
      const doc = await this.client.get<EvidenceRecord>('evidence_records', jobId);
      if (doc) return doc.data;
    } catch {
      // Fallback
    }
    return this.fallbackMemory.getEvidence(jobId);
  }

  async saveOpportunity(opportunity: DemandOpportunity): Promise<void> {
    await this.fallbackMemory.saveOpportunity(opportunity);
    try {
      await this.client.set(
        'demand_opportunities',
        opportunity.opportunityId,
        opportunity as unknown as Record<string, unknown>
      );
    } catch (err) {
      console.warn('[STORE WARN] Failed to sync opportunity to Firestore:', err);
    }
  }

  async listOpportunities(): Promise<DemandOpportunity[]> {
    return this.fallbackMemory.listOpportunities();
  }

  async getIdempotencyRecord(
    idempotencyKey: string,
    accountId: string
  ): Promise<IdempotencyRecord | null> {
    return this.fallbackMemory.getIdempotencyRecord(idempotencyKey, accountId);
  }

  async saveIdempotencyRecord(record: IdempotencyRecord): Promise<void> {
    await this.fallbackMemory.saveIdempotencyRecord(record);
  }

  async getWorker(workerId: string): Promise<WorkerDefinition | null> {
    return this.fallbackMemory.getWorker(workerId);
  }

  async saveWorker(worker: WorkerDefinition): Promise<void> {
    await this.fallbackMemory.saveWorker(worker);
  }

  async listWorkers(): Promise<WorkerDefinition[]> {
    return this.fallbackMemory.listWorkers();
  }
}

let storeInstance: IAgentEconomyStore | null = null;

export function getAgentEconomyStore(): IAgentEconomyStore {
  if (storeInstance) return storeInstance;

  if (isFirestoreRestConfigured()) {
    storeInstance = new FirestoreAgentEconomyStore();
  } else {
    storeInstance = new MemoryAgentEconomyStore();
  }

  return storeInstance;
}

export function resetAgentEconomyStoreForTesting(): void {
  storeInstance = new MemoryAgentEconomyStore();
}

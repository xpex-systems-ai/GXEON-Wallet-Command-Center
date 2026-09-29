import { FirestoreRestClient, isFirestoreRestConfigured } from '../../../api/_firestoreRest.js';
import type { ArtifactManifest, MissionState, QualificationAssessment, TaskmarketOpportunity, TaskmarketSettlement, TaskmarketSnapshot, TaskmarketTask } from './types.js';

export interface MarketplaceMission {
  missionId: string; provider: 'taskmarket'; taskId: string; sourceHash: string; state: MissionState;
  updatedAt: string; manifest?: ArtifactManifest;
}
export interface MarketplaceRepository {
  getSnapshot(): Promise<TaskmarketSnapshot | null>;
  saveSnapshot(snapshot: TaskmarketSnapshot): Promise<void>;
  saveOpportunity(task: TaskmarketTask, opportunity: TaskmarketOpportunity): Promise<void>;
  getAssessment(taskId: string): Promise<QualificationAssessment | null>;
  createMission(mission: MarketplaceMission): Promise<boolean>;
  saveMission(mission: MarketplaceMission): Promise<void>;
  getMission(taskId: string): Promise<MarketplaceMission | null>;
  listMissions(): Promise<MarketplaceMission[]>;
  recordSettlement(settlement: TaskmarketSettlement): Promise<boolean>;
  listSettlements(): Promise<TaskmarketSettlement[]>;
  acquirePollSlot(slot: string): Promise<boolean>;
}

export class FirestoreMarketplaceRepository implements MarketplaceRepository {
  constructor(private readonly db = new FirestoreRestClient()) {}
  async getSnapshot() { return (await this.db.get<TaskmarketSnapshot>('marketplace_agent_state', 'taskmarket'))?.data || null; }
  async saveSnapshot(snapshot: TaskmarketSnapshot) { await this.db.set('marketplace_agent_state', 'taskmarket', { ...snapshot }); }
  async saveOpportunity(task: TaskmarketTask, opportunity: TaskmarketOpportunity) {
    const id = `taskmarket:${task.id}`;
    await this.db.atomicCommit([
      this.db.makeUpdateWrite('paid_opportunities', id, { ...opportunity }),
      this.db.makeUpdateWrite('marketplace_tasks', id, { provider: 'taskmarket', task, fetchedAt: opportunity.fetchedAt }),
    ]);
  }
  async getAssessment(taskId: string) { return (await this.db.get<QualificationAssessment>('marketplace_assessments', `taskmarket:${taskId}`))?.data || null; }
  async createMission(mission: MarketplaceMission) {
    return (await this.db.createIfAbsent('marketplace_missions', `taskmarket:${mission.taskId}`, { ...mission })).created;
  }
  async saveMission(mission: MarketplaceMission) { await this.db.set('marketplace_missions', `taskmarket:${mission.taskId}`, { ...mission }); }
  async getMission(taskId: string) { return (await this.db.get<MarketplaceMission>('marketplace_missions', `taskmarket:${taskId}`))?.data || null; }
  async listMissions() { return (await this.db.listStrict<MarketplaceMission>('marketplace_missions')).map(d => d.data).filter(d => d.provider === 'taskmarket'); }
  async listSettlements() { return (await this.db.listStrict<TaskmarketSettlement>('marketplace_settlements')).map(d => d.data).filter(d => d.provider === 'taskmarket' && d.status === 'PAID' && d.verified === true); }
  async recordSettlement(settlement: TaskmarketSettlement) {
    // Only the watcher supplies verified chain evidence. Atomic create prevents double revenue even after a crash.
    if (settlement.status !== 'PAID' || settlement.verified !== true || BigInt(settlement.amountBaseUnits) <= 0n) throw new Error('SETTLEMENT_EVIDENCE_REQUIRED');
    const result = await this.db.atomicCommit([
      this.db.makeUpdateWrite('marketplace_settlements', settlement.id, { ...settlement }, { exists: false }),
      this.db.makeUpdateWrite('machine_revenue', settlement.id, {
        provider: 'taskmarket', taskId: settlement.taskId, amountUsdc: settlement.amountUsdc,
        amountBaseUnits: settlement.amountBaseUnits, currency: 'USDC', network: settlement.network,
        transactionHash: settlement.transactionHash, recipient: settlement.workerAddress,
        settledAt: settlement.settledAt, status: 'SETTLED', settlementEvidenceId: settlement.id,
      }, { exists: false }),
    ]);
    return result === 'COMMITTED';
  }
  async acquirePollSlot(slot: string) {
    return (await this.db.createIfAbsent('marketplace_poll_runs', slot, { provider: 'taskmarket', startedAt: new Date().toISOString() })).created;
  }
}

export function marketplaceRepository(): MarketplaceRepository {
  if (!isFirestoreRestConfigured()) throw new Error('TASKMARKET_DURABLE_STORE_UNAVAILABLE');
  return new FirestoreMarketplaceRepository();
}

import { sourceHash } from '../../src/agent-economy/connectors/taskmarketConnector.js';
import type { FundingEvidence, LegalBundle, QualificationAssessment, RequesterStats, TaskmarketTask, WorkerStatus, TaskmarketSnapshot, TaskmarketOpportunity, TaskmarketSettlement } from '../../src/agent-economy/taskmarket/types.js';
import type { MarketplaceMission, MarketplaceRepository } from '../../src/agent-economy/taskmarket/repository.js';

export const taskId = `0x${'1'.repeat(64)}`;
export const requester = `0x${'2'.repeat(40)}`;
export const worker = `0x${'3'.repeat(40)}`;
export const txHash = `0x${'4'.repeat(64)}`;
export function taskFixture(updates: Partial<TaskmarketTask> = {}): TaskmarketTask {
  return { id: taskId, requester, referenceCode: 'TSK-TEST', description: 'Validate the supplied JSON against the specified schema and deliver result.json.',
    reward: '10000000', netReward: '9250000', escrowTxHash: txHash, createdAt: '2026-01-01T00:00:00Z', expiryTime: '2099-01-01T00:00:00Z',
    status: 'open', mode: 'bounty', tags: ['json'], claimedBy: null, stakeRequired: false, stakeBps: 0, platformFeeBps: 750,
    submissionCount: 0, pitchCount: 0, auctionBidCount: null, submissionWindowOpen: true, pitchDeadline: null, bidDeadline: null,
    pendingActions: [{ role: 'worker', action: 'submit', requiresPayment: false }], awards: [], hooks: [], evaluator: null, ...updates };
}
export const legalFixture: LegalBundle = { version: 'test-version', bundleDigest: `sha256:${'a'.repeat(64)}`, status: 'draft', enforcementEnabled: false,
  acceptanceAvailable: false, documents: ['terms', 'privacy', 'risks', 'acceptable-use'].map(slug => ({ slug, title: slug, version: 'test-version',
    contentHash: `sha256:${'b'.repeat(64)}`, url: `https://api.taskmarket.dev/legal-documents/test-version/${slug}` })), fetchedAt: '2026-01-01T00:00:00Z', acceptedAt: null, actor: null };
export const reputationFixture: RequesterStats = { completedCount: 10, selfAwardCount: 0, totalTasksCreated: 12, cancelledAfterSubmissionsCount: 0,
  expiredNoActionCount: 0, expiredAfterRejectionsCount: 0, totalSubmissionAttempts: 20, totalUniqueWorkers: 10 };
export const identityFixture: WorkerStatus = { status: 'REGISTERED', walletAddress: worker, registered: true, agentId: '1', stats: null };
export function fundingFixture(): FundingEvidence { return { verified: true, status: 'ONCHAIN_VERIFIED', transactionHash: txHash, blockNumber: '12', checkedAt: new Date().toISOString(), reason: null }; }
export function assessmentFixture(task = taskFixture()): QualificationAssessment {
  return { sourceHash: sourceHash(task), reviewedBy: 'test-operator', reviewedAt: new Date().toISOString(), capability: 'gxeon_json_validate_v1', input: { payload: { valid: true } },
    scopeVerified: true, safeContentVerified: true, criteriaVerified: true, hooksReviewed: true, submissionRequirements: { extensions: ['.json'], maxBytes: 50000 },
    estimatedMinutes: 5, estimatedExecutionCostUsdc: 0.05, externalSpendUsdc: 0 };
}
export class MemoryMarketplaceRepository implements MarketplaceRepository {
  snapshot: TaskmarketSnapshot | null = null;
  tasks = new Map<string, TaskmarketTask>(); opportunities = new Map<string, TaskmarketOpportunity>();
  assessments = new Map<string, QualificationAssessment>(); missions = new Map<string, MarketplaceMission>();
  settlements = new Map<string, TaskmarketSettlement>(); slots = new Set<string>();
  async getSnapshot() { return this.snapshot; }
  async saveSnapshot(s: TaskmarketSnapshot) { this.snapshot = s; }
  async saveOpportunity(t: TaskmarketTask, o: TaskmarketOpportunity) { this.tasks.set(t.id, t); this.opportunities.set(t.id, o); }
  async getAssessment(id: string) { return this.assessments.get(id) || null; }
  async createMission(m: MarketplaceMission) { if (this.missions.has(m.taskId)) return false; this.missions.set(m.taskId, m); return true; }
  async saveMission(m: MarketplaceMission) { this.missions.set(m.taskId, m); }
  async getMission(id: string) { return this.missions.get(id) || null; }
  async listMissions() { return [...this.missions.values()]; }
  async recordSettlement(s: TaskmarketSettlement) { if (this.settlements.has(s.id)) return false; this.settlements.set(s.id, s); return true; }
  async listSettlements() { return [...this.settlements.values()]; }
  async acquirePollSlot(slot: string) { if (this.slots.has(slot)) return false; this.slots.add(slot); return true; }
}

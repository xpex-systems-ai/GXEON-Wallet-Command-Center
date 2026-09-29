import { TaskmarketConnector, taskmarketConnector, taskmarketWritesEnabled } from '../connectors/taskmarketConnector.js';
import { verifyTaskFunding } from './chainEvidence.js';
import { qualifyTask, rankOpportunities } from './qualification.js';
import { marketplaceRepository, type MarketplaceRepository } from './repository.js';
import { TaskmarketSettlementWatcher } from './settlementWatcher.js';
import { TASKMARKET_POLL_CADENCE, withSchedulerHealth } from './schedulerHealth.js';
import type { TaskmarketSnapshot, WorkerStatus, RequesterStats } from './types.js';

const publicWorker = (): string | undefined => process.env.GXEON_TASKMARKET_WORKER_ADDRESS?.trim() || undefined;
export async function scanTaskmarket(options: {
  connector?: TaskmarketConnector; repository?: MarketplaceRepository; verifyFunding?: typeof verifyTaskFunding; persist?: boolean;
} = {}): Promise<TaskmarketSnapshot> {
  const connector = options.connector || taskmarketConnector;
  const repository = options.repository;
  const verifyFunding = options.verifyFunding || verifyTaskFunding;
  const now = new Date().toISOString();
  const snapshot: TaskmarketSnapshot = {
    provider: 'taskmarket', configured: true, apiReachable: false, networkVerified: false, legalFetched: false,
    network: null, legal: null, identity: { status: 'PUBLIC_ADDRESS_REQUIRED', walletAddress: null, registered: null, agentId: null, stats: null },
    identityRegistered: null, agentId: null, walletAddress: null, writeEnabled: taskmarketWritesEnabled(),
    openTasks: 0, fundedTasksAvailable: 0, qualifiedTasksAvailable: 0, claimReady: 0,
    activeClaims: null, submittedTasks: null, paidTasks: null, totalSettledUsdc: null,
    opportunities: [], errors: [], fetchedAt: now, openApiHash: null, persistence: repository ? 'DURABLE' : 'UNAVAILABLE',
    scheduler: { kind: 'github_actions_oidc', cadence: TASKMARKET_POLL_CADENCE, lastSuccessfulPoll: null },
  };
  try {
    // Schema, network and legal all gate discovery. Network disagreement cannot degrade to success.
    const [schema, network, legal] = await Promise.all([connector.getOpenApi(), connector.getTaskmarketNetwork(), connector.getTaskmarketLegalCurrent()]);
    Object.assign(snapshot, { apiReachable: true, networkVerified: true, legalFetched: true, openApiHash: schema.hash, network, legal });
    let identity: WorkerStatus;
    try { identity = await connector.getWorkerStatus(publicWorker()); }
    catch { identity = { status: 'ERROR', walletAddress: publicWorker() || null, registered: null, agentId: null, stats: null, error: 'WORKER_STATUS_UNAVAILABLE' }; }
    Object.assign(snapshot, { identity, identityRegistered: identity.registered, agentId: identity.agentId, walletAddress: identity.walletAddress });
    const listed = await connector.listOpenTasks(); snapshot.openTasks = listed.length;
    const reputations = new Map<string, Promise<RequesterStats | null>>();
    // Bounded concurrency avoids hammering the marketplace and public Base RPC.
    for (let i = 0; i < listed.length; i += 4) {
      await Promise.all(listed.slice(i, i + 4).map(async summary => {
        try {
          const task = await connector.getTask(summary.id);
          if (!reputations.has(task.requester)) reputations.set(task.requester, connector.getRequesterStats(task.requester).catch(() => null));
          const [funding, requester, assessment] = await Promise.all([verifyFunding(task), reputations.get(task.requester)!, repository?.getAssessment(task.id) ?? null]);
          const opportunity = qualifyTask(task, { funding, requester, assessment, legal, identity });
          if (repository && options.persist) await repository.saveOpportunity(task, opportunity);
          snapshot.opportunities.push(opportunity);
        } catch { snapshot.errors.push(`TASK_DETAIL_OR_STORAGE_UNAVAILABLE:${summary.id}`); }
      }));
    }
    snapshot.opportunities = rankOpportunities(snapshot.opportunities);
    snapshot.fundedTasksAvailable = snapshot.opportunities.filter(o => o.fundingStatus === 'ONCHAIN_VERIFIED').length;
    snapshot.qualifiedTasksAvailable = snapshot.opportunities.filter(o => ['QUALIFIED', 'CLAIM_READY'].includes(o.state)).length;
    snapshot.claimReady = snapshot.opportunities.filter(o => o.state === 'CLAIM_READY').length;
    if (repository) {
      if (identity.walletAddress && options.persist) await new TaskmarketSettlementWatcher(connector, repository).reconcile(identity.walletAddress);
      const [missions, settlements] = await Promise.all([repository.listMissions(), repository.listSettlements()]);
      snapshot.activeClaims = missions.filter(m => ['CLAIMED', 'EXECUTING', 'DELIVERY_READY'].includes(m.state)).length;
      snapshot.submittedTasks = missions.filter(m => ['SUBMITTED', 'ACCEPTED', 'SETTLEMENT_PENDING'].includes(m.state)).length;
      snapshot.paidTasks = new Set(settlements.map(s => s.taskId)).size;
      snapshot.totalSettledUsdc = Number(settlements.reduce((sum, s) => sum + BigInt(s.amountBaseUnits), 0n)) / 1e6;
      const previous = await repository.getSnapshot();
      snapshot.scheduler.lastSuccessfulPoll = previous?.scheduler.lastSuccessfulPoll || null;
    }
  } catch (error) {
    if (snapshot.totalSettledUsdc === null) snapshot.persistence = 'UNAVAILABLE';
    snapshot.errors.push(error instanceof Error && /^TASKMARKET_[A-Z_0-9]+$/.test(error.message) ? error.message : 'TASKMARKET_SCAN_FAILED');
  }
  return withSchedulerHealth(snapshot);
}

export async function pollTaskmarket(repository = marketplaceRepository()): Promise<TaskmarketSnapshot> {
  const slot = `taskmarket:${Math.floor(Date.now() / 900_000)}`;
  if (!await repository.acquirePollSlot(slot)) {
    const cached = await repository.getSnapshot();
    if (!cached || Date.now() - Date.parse(cached.fetchedAt) > 900_000) throw new Error('TASKMARKET_POLL_ALREADY_RUNNING');
    return withSchedulerHealth(cached);
  }
  const snapshot = await scanTaskmarket({ repository, persist: true });
  const previous = await repository.getSnapshot();
  snapshot.scheduler.lastSuccessfulPoll = snapshot.apiReachable && snapshot.errors.length === 0 ? snapshot.fetchedAt : previous?.scheduler.lastSuccessfulPoll || null;
  const result = withSchedulerHealth(snapshot);
  await repository.saveSnapshot(result);
  return result;
}

export async function readTaskmarketStatus(live = false): Promise<TaskmarketSnapshot> {
  if (!live) {
    try { const cached = await marketplaceRepository().getSnapshot(); if (cached) return withSchedulerHealth(cached); } catch { /* Report live reads with unavailable persistence explicitly. */ }
  }
  try { return await scanTaskmarket({ repository: marketplaceRepository() }); }
  catch { return scanTaskmarket(); }
}

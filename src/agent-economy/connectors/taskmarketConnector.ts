import { createHash } from 'node:crypto';
import type { LegalBundle, RequesterStats, TaskmarketNetwork, TaskmarketTask, WorkerStatus } from '../taskmarket/types.js';

export const TASKMARKET_API = 'https://api.taskmarket.dev';
export const TASKMARKET_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
export const TASKMARKET_CONTRACT = '0xDDc6cC3e4D11c1f3527B867C7DAD4ED9869C33f7';
export const ADDRESS = /^0x[a-fA-F0-9]{40}$/;
export const HASH = /^0x[a-fA-F0-9]{64}$/;
const UINT = /^(0|[1-9][0-9]*)$/;
const DIGEST = /^sha256:[a-f0-9]{64}$/;
export const sha256 = (data: string | Uint8Array): string => createHash('sha256').update(data).digest('hex');
export const sourceHash = (task: TaskmarketTask): string => sha256(JSON.stringify({
  id: task.id, requester: task.requester, description: task.description, reward: task.reward,
  netReward: task.netReward, expiryTime: task.expiryTime, mode: task.mode, hooks: task.hooks,
  evaluator: task.evaluator, stakeRequired: task.stakeRequired, stakeBps: task.stakeBps,
  platformFeeBps: task.platformFeeBps, pitchDeadline: task.pitchDeadline, bidDeadline: task.bidDeadline,
}));

export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('TASKMARKET_MALFORMED_API');
  return value as Record<string, unknown>;
}
function string(value: unknown, pattern?: RegExp): string {
  if (typeof value !== 'string' || (pattern && !pattern.test(value))) throw new Error('TASKMARKET_MALFORMED_API');
  return value;
}
function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) throw new Error('TASKMARKET_MALFORMED_API');
  return value;
}
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('TASKMARKET_MALFORMED_API');
  return value;
}
function date(value: unknown): string {
  const result = string(value);
  if (!Number.isFinite(Date.parse(result))) throw new Error('TASKMARKET_MALFORMED_DATE');
  return result;
}
function nullableDate(value: unknown): string | null { return value == null ? null : date(value); }
export function usdc(baseUnits: string): number {
  string(baseUnits, UINT);
  if (BigInt(baseUnits) > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('TASKMARKET_AMOUNT_OUT_OF_RANGE');
  return Number(baseUnits) / 1_000_000;
}
function array(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new Error('TASKMARKET_MALFORMED_API');
  return value;
}

export function parseTask(value: unknown, detail = true): TaskmarketTask {
  const t = object(value);
  const reward = string(t.reward, UINT); usdc(reward);
  const mode = string(t.mode) as TaskmarketTask['mode'];
  if (!['claim', 'bounty', 'pitch', 'benchmark', 'auction'].includes(mode)) throw new Error('TASKMARKET_UNKNOWN_MODE');
  const stakeBps = count(t.stakeBps); const platformFeeBps = count(t.platformFeeBps);
  if (stakeBps > 10000 || platformFeeBps > 10000) throw new Error('TASKMARKET_MALFORMED_API');
  return {
    id: string(t.id, HASH), referenceCode: t.referenceCode == null ? null : string(t.referenceCode),
    description: string(t.description).slice(0, 100_000), requester: string(t.requester, ADDRESS),
    reward, netReward: t.netReward == null ? null : string(t.netReward, UINT), escrowTxHash: string(t.escrowTxHash, HASH),
    createdAt: date(t.createdAt), expiryTime: date(t.expiryTime), status: string(t.status), mode,
    tags: array(t.tags).map(x => string(x)), claimedBy: t.claimedBy == null ? null : string(t.claimedBy, ADDRESS),
    stakeRequired: bool(t.stakeRequired), stakeBps, platformFeeBps, submissionCount: count(t.submissionCount),
    pitchCount: count(t.pitchCount), auctionBidCount: t.auctionBidCount == null ? null : count(t.auctionBidCount),
    submissionWindowOpen: bool(t.submissionWindowOpen), pitchDeadline: nullableDate(t.pitchDeadline), bidDeadline: nullableDate(t.bidDeadline),
    pendingActions: array(detail ? t.pendingActions : (t.pendingActions || [])).map(value => {
      const a = object(value);
      return { role: string(a.role), action: string(a.action),
        eligibleAddress: a.eligibleAddress == null ? null : string(a.eligibleAddress, ADDRESS),
        requiresPayment: a.requiresPayment === undefined ? undefined : bool(a.requiresPayment),
        paymentAmount: a.paymentAmount == null ? null : string(a.paymentAmount, UINT),
        availableAfter: nullableDate(a.availableAfter), availableUntil: nullableDate(a.availableUntil) };
    }),
    awards: array(t.awards || []).map(value => { const a = object(value); return {
      workerAddress: string(a.workerAddress, ADDRESS), workerPayment: string(a.workerPayment, UINT),
      grossAmount: string(a.grossAmount, UINT), platformFee: string(a.platformFee, UINT),
      settlementTxHash: string(a.settlementTxHash, HASH), settledAt: date(a.settledAt),
    }; }),
    hooks: array(t.hooks || []).map(x => string(x, ADDRESS)),
    evaluator: t.evaluator == null ? null : string(t.evaluator, ADDRESS),
  };
}

/** Public GETs only. No auth, cookies, private keys, payment headers or redirects. */
export class TaskmarketConnector {
  constructor(private readonly fetcher: typeof fetch = fetch) {}
  async read(path: string): Promise<unknown> {
    if (!path.startsWith('/') || path.startsWith('//')) throw new Error('TASKMARKET_INVALID_PATH');
    const response = await this.fetcher(`${TASKMARKET_API}${path}`, {
      method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error(`TASKMARKET_HTTP_${response.status}`);
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('TASKMARKET_RESPONSE_TOO_LARGE');
    try { return JSON.parse(text); } catch { throw new Error('TASKMARKET_MALFORMED_JSON'); }
  }
  async getOpenApi(): Promise<{ hash: string; version: string }> {
    const raw = await this.read('/openapi.json'); const schema = object(raw); const paths = object(schema.paths);
    for (const [path, method, id] of [
      ['/tasks', 'get', 'tasks-list'], ['/tasks/{taskId}', 'get', 'tasks-get'],
      ['/legal/current', 'get', 'legal-current'], ['/identity/status', 'get', 'identity-status'],
      ['/tasks/{taskId}/submissions', 'post', 'submissions-submit'],
    ]) {
      if (object(object(paths[path])[method]).operationId !== id) throw new Error('TASKMARKET_SCHEMA_DRIFT');
    }
    // The live document advertises localhost in servers. Never derive an origin from it.
    return { hash: sha256(JSON.stringify(raw)), version: string(object(schema.info).version) };
  }
  async getTaskmarketNetwork(): Promise<TaskmarketNetwork> {
    const payload = object(await this.read('/trpc/network.info'));
    const n = object(object(payload.result).data);
    if (n.chainId !== 8453 || String(n.usdcAddress).toLowerCase() !== TASKMARKET_USDC.toLowerCase() ||
      String(n.contractAddress).toLowerCase() !== TASKMARKET_CONTRACT.toLowerCase() ||
      !['Base', 'Base Mainnet'].includes(String(n.networkName))) throw new Error('TASKMARKET_NETWORK_MISMATCH');
    return { chainId: 8453, currency: 'USDC', networkName: string(n.networkName),
      usdcAddress: TASKMARKET_USDC, contractAddress: TASKMARKET_CONTRACT, verified: true };
  }
  async getTaskmarketLegalCurrent(): Promise<LegalBundle> {
    const l = object(await this.read('/api/legal/current'));
    if (!['draft', 'approved'].includes(String(l.status))) throw new Error('TASKMARKET_LEGAL_INVALID');
    const documents = array(l.documents).map(value => {
      const d = object(value); const url = string(d.url); const parsed = new URL(url);
      if (parsed.origin !== TASKMARKET_API || !parsed.pathname.startsWith('/legal-documents/')) throw new Error('TASKMARKET_LEGAL_ORIGIN');
      return { slug: string(d.slug), title: string(d.title), version: string(d.version), contentHash: string(d.contentHash, DIGEST), url };
    });
    if (new Set(documents.map(d => d.slug)).size !== 4 || !['terms', 'privacy', 'risks', 'acceptable-use'].every(s => documents.some(d => d.slug === s))) throw new Error('TASKMARKET_LEGAL_INCOMPLETE');
    return { version: string(l.version), bundleDigest: string(l.bundleDigest, DIGEST), status: l.status as LegalBundle['status'],
      enforcementEnabled: bool(l.enforcementEnabled), acceptanceAvailable: bool(l.acceptanceAvailable), documents,
      fetchedAt: new Date().toISOString(), acceptedAt: null, actor: null };
  }
  async listOpenTasks(): Promise<TaskmarketTask[]> {
    const unique = new Map<string, TaskmarketTask>(); let cursor: string | null = null;
    const seen = new Set<string>();
    for (let page = 0; page < 10; page++) {
      const params = new URLSearchParams({ status: 'open', sort: 'newest', limit: '100' });
      if (cursor) params.set('cursor', cursor);
      const data = object(await this.read(`/api/tasks?${params}`));
      for (const raw of array(data.tasks)) { const task = parseTask(raw, false); unique.set(task.id, task); }
      if (!bool(data.hasMore)) return [...unique.values()];
      cursor = date(data.nextCursor);
      if (seen.has(cursor)) throw new Error('TASKMARKET_PAGINATION_LOOP');
      seen.add(cursor);
    }
    throw new Error('TASKMARKET_DISCOVERY_TRUNCATED');
  }
  async getTask(taskId: string): Promise<TaskmarketTask> {
    string(taskId, HASH); const task = parseTask(await this.read(`/api/tasks/${taskId}`));
    if (task.id.toLowerCase() !== taskId.toLowerCase()) throw new Error('TASKMARKET_TASK_MISMATCH');
    return task;
  }
  async getRequesterStats(address: string): Promise<RequesterStats> {
    string(address, ADDRESS); const data = object(await this.read(`/api/requester/${address}/stats`));
    const result: Record<string, number> = {};
    for (const k of ['completedCount', 'selfAwardCount', 'cancelledAfterSubmissionsCount', 'expiredNoActionCount', 'expiredAfterRejectionsCount', 'totalTasksCreated', 'totalSubmissionAttempts', 'totalUniqueWorkers']) result[k] = count(data[k]);
    return result as unknown as RequesterStats;
  }
  async getWorkerStatus(address?: string): Promise<WorkerStatus> {
    if (!address) return { status: 'PUBLIC_ADDRESS_REQUIRED', walletAddress: null, registered: null, agentId: null, stats: null };
    string(address, ADDRESS);
    const i = object(await this.read(`/api/identity/status?address=${address}`));
    const reportedRegistered = bool(i.registered); const agentId = i.agentId == null ? null : string(i.agentId, UINT);
    if (reportedRegistered && !agentId) throw new Error('TASKMARKET_IDENTITY_MISMATCH');
    const cacheFresh = bool(i.cacheFresh);
    // An ID minted against another registry/chain is not a current worker identity.
    const registered = reportedRegistered && cacheFresh;
    const result: WorkerStatus = { status: registered ? 'REGISTERED' : 'REGISTRATION_PENDING', walletAddress: address, registered, agentId, cacheFresh, stats: null };
    const s = object(await this.read(`/api/agents/stats?address=${address}`));
    if (String(s.address).toLowerCase() !== address.toLowerCase()) throw new Error('TASKMARKET_WORKER_MISMATCH');
    let balance: string | null = null;
    try { const b = object(await this.read(`/api/wallet/balance?address=${address}`)); balance = string(b.balanceBaseUnits, UINT); } catch { /* Protected balance is explicitly unavailable. */ }
    result.stats = { completedTasks: count(s.completedTasks), totalEarningsBaseUnits: string(s.totalEarnings, UINT),
      averageRating: typeof s.averageRating === 'number' ? s.averageRating : null, balanceBaseUnits: balance };
    return result;
  }
}

export const taskmarketConnector = new TaskmarketConnector();
export const taskmarketWritesEnabled = (): boolean => process.env.GXEON_TASKMARKET_WRITES_ENABLED === 'true';

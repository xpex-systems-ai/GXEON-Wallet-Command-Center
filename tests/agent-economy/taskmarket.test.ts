import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign } from 'node:crypto';
import { TaskmarketConnector, TASKMARKET_CONTRACT, TASKMARKET_USDC, sourceHash, usdc } from '../../src/agent-economy/connectors/taskmarketConnector.js';
import { qualifyTask, previewAction } from '../../src/agent-economy/taskmarket/qualification.js';
import { scanTaskmarket } from '../../src/agent-economy/taskmarket/taskmarketRadar.js';
import { TASKMARKET_MCP_TOOLS, callTaskmarketTool } from '../../src/agent-economy/taskmarket/mcpTools.js';
import { SwarmExecutionAgent, SwarmScoutAgent } from '../../src/agent-economy/autonomous/quantumSwarm.js';
import { buildArtifactManifest, assertNoSecretMaterial, TaskmarketExecutionAdapter } from '../../src/agent-economy/taskmarket/executionAdapter.js';
import { authorizeRadarPoll, POLL_AUDIENCE, validateSchedulerClaims } from '../../src/agent-economy/taskmarket/schedulerAuth.js';
import { TaskmarketSettlementWatcher } from '../../src/agent-economy/taskmarket/settlementWatcher.js';
import { taskFixture, fundingFixture, legalFixture, reputationFixture, identityFixture, assessmentFixture, MemoryMarketplaceRepository, taskId, worker } from '../fixtures/taskmarket.js';

const network = { chainId: 8453, networkName: 'Base', usdcAddress: TASKMARKET_USDC, contractAddress: TASKMARKET_CONTRACT };
const response = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'Content-Type': 'application/json' } });
function context(task = taskFixture()) { return { funding: fundingFixture(), legal: legalFixture, requester: reputationFixture, identity: identityFixture, assessment: assessmentFixture(task) }; }
function mockConnector(task = taskFixture()) {
  const c = new TaskmarketConnector();
  vi.spyOn(c, 'getOpenApi').mockResolvedValue({ hash: 'schema-hash', version: '1.0.0' });
  vi.spyOn(c, 'getTaskmarketNetwork').mockResolvedValue({ ...network, chainId: 8453, verified: true, currency: 'USDC' });
  vi.spyOn(c, 'getTaskmarketLegalCurrent').mockResolvedValue(legalFixture);
  vi.spyOn(c, 'getWorkerStatus').mockResolvedValue(identityFixture);
  vi.spyOn(c, 'listOpenTasks').mockResolvedValue([task]);
  vi.spyOn(c, 'getTask').mockResolvedValue(task);
  vi.spyOn(c, 'getRequesterStats').mockResolvedValue(reputationFixture);
  return c;
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe('Taskmarket LIVE contract boundary', () => {
  it.each([{ ...network, chainId: 1 }, { ...network, usdcAddress: worker }, { ...network, contractAddress: worker }])('fails closed on wrong network/token/escrow', async wrong => {
    const c = new TaskmarketConnector(vi.fn(async () => response({ result: { data: wrong } })));
    await expect(c.getTaskmarketNetwork()).rejects.toThrow('NETWORK_MISMATCH');
  });
  it('uses public GETs, pinned origin, no payment or signature headers', async () => {
    const fetcher = vi.fn(async () => response({ result: { data: network } }));
    const c = new TaskmarketConnector(fetcher); expect((await c.getTaskmarketNetwork()).verified).toBe(true);
    expect(fetcher).toHaveBeenCalledWith('https://api.taskmarket.dev/trpc/network.info', expect.objectContaining({ method: 'GET', redirect: 'error', headers: { Accept: 'application/json' } }));
  });
  it('rejects schema drift and malformed tasks instead of reporting zero work', async () => {
    const c = new TaskmarketConnector(vi.fn(async () => response({ paths: {} })));
    await expect(c.getOpenApi()).rejects.toThrow();
    await expect(c.getTask(taskId)).rejects.toThrow();
  });
  it('rejects injected path and task mismatch', async () => {
    const f = vi.fn(async () => response(taskFixture())); const c = new TaskmarketConnector(f);
    await expect(c.getTask('../../wallet')).rejects.toThrow(); expect(f).not.toHaveBeenCalled();
    await expect(c.getTask(`0x${'f'.repeat(64)}`)).rejects.toThrow('TASK_MISMATCH');
  });
  it('deduplicates paginated tasks and refuses pagination loops', async () => {
    const f = vi.fn().mockResolvedValueOnce(response({ tasks: [taskFixture()], hasMore: true, nextCursor: '2026-01-01T00:00:00Z' }))
      .mockResolvedValueOnce(response({ tasks: [taskFixture()], hasMore: false, nextCursor: null }));
    expect(await new TaskmarketConnector(f).listOpenTasks()).toHaveLength(1);
    f.mockImplementation(async () => response({ tasks: [], hasMore: true, nextCursor: '2026-01-01T00:00:00Z' }));
    await expect(new TaskmarketConnector(f).listOpenTasks()).rejects.toThrow('PAGINATION_LOOP');
  });
  it('reads exact legal digest without fabricating an acceptance receipt', async () => {
    const c = new TaskmarketConnector(vi.fn(async () => response(legalFixture)));
    const legal = await c.getTaskmarketLegalCurrent();
    expect(legal.acceptedAt).toBeNull(); expect(legal.actor).toBeNull(); expect(legal.bundleDigest).toBe(legalFixture.bundleDigest);
  });
  it('never initializes a wallet when no public identity is configured', async () => {
    const f = vi.fn(); expect((await new TaskmarketConnector(f).getWorkerStatus()).status).toBe('PUBLIC_ADDRESS_REQUIRED'); expect(f).not.toHaveBeenCalled();
  });
  it('uses exact USDC base-unit strings and rejects unsafe ranges', () => {
    expect(usdc('1000')).toBe(0.001); expect(() => usdc('1e6')).toThrow(); expect(() => usdc('9007199254740992')).toThrow();
  });
});

describe('qualification, budgets and approval gates', () => {
  it.each([
    [{ expiryTime: '2020-01-01T00:00:00Z' }, 'TASK_EXPIRED'], [{ reward: '0', netReward: '0' }, 'ZERO_REWARD'],
    [{ status: 'completed' }, 'TASK_NOT_OPEN'], [{ claimedBy: worker }, 'ALREADY_CLAIMED'],
    [{ submissionCount: 80, reward: '2000000', netReward: '1850000' }, 'COMPETITION_TOO_HIGH_FOR_REWARD'],
  ] as const)('rejects unusable task state', (updates, reason) => {
    const t = taskFixture(updates); expect(qualifyTask(t, context(t)).rejectionReasons).toContain(reason);
  });
  it('does not promote a keyword match or an unfunded reward', () => {
    const t = taskFixture(); const c = context(t);
    expect(qualifyTask(t, { ...c, assessment: null }).fitScore).toBe(0);
    expect(qualifyTask(t, { ...c, funding: { ...c.funding, verified: false, status: 'UNVERIFIED' } }).blockers).toContain('FUNDING_NOT_VERIFIED');
  });
  it('keeps acceptance probability and expected value unknown, and exposes fee-adjusted ceiling', () => {
    const o = qualifyTask(taskFixture(), context());
    expect(o.state).toBe('CLAIM_READY'); expect(o.probabilityOfAcceptance).toBeNull(); expect(o.expectedNetUsdc).toBeNull();
    expect(o.maximumNetIfAcceptedUsdc).toBeCloseTo(9.2);
  });
  it('rejects impossible deadlines, adverse requesters and negative economics', () => {
    const t = taskFixture({ expiryTime: new Date(Date.now() + 60_000).toISOString() });
    const c = context(t); c.assessment.estimatedExecutionCostUsdc = 11;
    c.requester = { ...c.requester, cancelledAfterSubmissionsCount: 8 };
    const o = qualifyTask(t, c); expect(o.rejectionReasons).toEqual(expect.arrayContaining(['DEADLINE_IMPOSSIBLE', 'COST_EXCEEDS_REWARD', 'POOR_REQUESTER_HISTORY']));
  });
  it('invalidates an assessment when the brief or legal enforcement changes', () => {
    const c = context();
    expect(qualifyTask(taskFixture({ description: 'Changed scope' }), c).blockers).toContain('SCOPE_AND_COST_REVIEW_REQUIRED');
    expect(qualifyTask(taskFixture(), { ...c, legal: { ...c.legal, enforcementEnabled: true } }).blockers).toContain('LEGAL_ACCEPTANCE_REQUIRED');
  });
  it('does not let an assessment erase an upstream payment requirement', () => {
    const t = taskFixture({ pendingActions: [{ role: 'worker', action: 'submit', requiresPayment: true, paymentAmount: '1000' }] });
    const o = qualifyTask(t, context(t)); expect(o.requiresSpend).toBe(true); expect(o.blockers).toContain('SPEND_APPROVAL_REQUIRED');
    const expensive = taskFixture({ pendingActions: [{ role: 'worker', action: 'submit', requiresPayment: true, paymentAmount: '10000000' }] });
    expect(qualifyTask(expensive, context(expensive)).rejectionReasons).toContain('COST_EXCEEDS_REWARD');
  });
  it('requires bond and wallet-signature approval even with writes enabled', async () => {
    vi.stubEnv('GXEON_TASKMARKET_WRITES_ENABLED', 'true');
    const t = taskFixture({ stakeRequired: true, stakeBps: 1000 }); const o = qualifyTask(t, context(t));
    const p = previewAction(t, 'submit', o, worker);
    expect(p.bondUsdc).toBe(1); expect(p.executable).toBe(false); expect(p.approvalRequired).toBe(true);
    await expect(callTaskmarketTool('taskmarket_submit', { taskId })).rejects.toThrow('HUMAN_APPROVAL_REQUIRED');
  });
  it('has all ten read/preview tools and four fail-closed writes', async () => {
    vi.stubEnv('GXEON_TASKMARKET_WRITES_ENABLED', 'false'); expect(TASKMARKET_MCP_TOOLS).toHaveLength(14);
    for (const action of ['claim', 'pitch', 'bid', 'submit']) await expect(callTaskmarketTool(`taskmarket_${action}`, { taskId })).rejects.toThrow('WRITES_DISABLED');
    const t = taskFixture(); expect(previewAction(t, 'claim', qualifyTask(t, context(t)), worker).actionAvailable).toBe(false);
  });
});

describe('radar persistence and Money Truth', () => {
  it('ingests idempotently without missions, submissions or revenue', async () => {
    const repository = new MemoryMarketplaceRepository(); const connector = mockConnector();
    repository.assessments.set(taskId, assessmentFixture());
    const scan = () => scanTaskmarket({ connector, repository, persist: true, verifyFunding: async () => fundingFixture() });
    const first = await scan(); await scan();
    expect(repository.tasks.size).toBe(1); expect(repository.opportunities.size).toBe(1); expect(first.claimReady).toBe(1);
    expect(first.paidTasks).toBe(0); expect(first.totalSettledUsdc).toBe(0); expect(repository.missions.size).toBe(0);
  });
  it('stops discovery on network mismatch', async () => {
    const connector = mockConnector(); vi.mocked(connector.getTaskmarketNetwork).mockRejectedValue(new Error('TASKMARKET_NETWORK_MISMATCH'));
    const result = await scanTaskmarket({ connector }); expect(result.networkVerified).toBe(false); expect(connector.listOpenTasks).not.toHaveBeenCalled();
  });
  it('reports unavailable storage without inventing zero historical revenue', async () => {
    const repository = new MemoryMarketplaceRepository();
    vi.spyOn(repository, 'listSettlements').mockRejectedValue(new Error('Storage unavailable'));
    const result = await scanTaskmarket({ connector: mockConnector(), repository, verifyFunding: async () => fundingFixture() });
    expect(result.apiReachable).toBe(true); expect(result.totalSettledUsdc).toBeNull();
    expect(result.persistence).toBe('UNAVAILABLE'); expect(result.errors).not.toHaveLength(0);
  });
  it('never converts provider acceptance without onchain settlement to money', async () => {
    const repository = new MemoryMarketplaceRepository();
    await repository.createMission({ missionId: `taskmarket:${taskId}`, provider: 'taskmarket', taskId, sourceHash: sourceHash(taskFixture()), state: 'ACCEPTED', updatedAt: new Date().toISOString() });
    const connector = mockConnector(taskFixture({ status: 'completed', awards: [{ workerAddress: worker, workerPayment: '9250000', grossAmount: '10000000', platformFee: '750000', settlementTxHash: `0x${'f'.repeat(64)}`, settledAt: new Date().toISOString() }] }));
    const watcher = new TaskmarketSettlementWatcher(connector, repository, async () => null);
    expect(await watcher.reconcile(worker)).toBe(0); expect(repository.settlements.size).toBe(0);
  });
});

describe('execution and artifact evidence', () => {
  it('blocks before execution without reviewed scope', async () => {
    const executor = new SwarmExecutionAgent(); const spy = vi.spyOn(executor, 'executeMarketplaceService');
    const adapter = new TaskmarketExecutionAdapter(mockConnector(), new MemoryMarketplaceRepository(), executor);
    await expect(adapter.execute(taskId)).rejects.toThrow('TASK_SCOPE_REVIEW_REQUIRED'); expect(spy).not.toHaveBeenCalled();
  });
  it('hashes actual file bytes and refuses failed test evidence', () => {
    const params = { task: taskFixture(), startedAt: '2026-01-01T00:00:00Z', completedAt: '2026-01-01T00:01:00Z',
      files: [{ name: 'result.json', mimeType: 'application/json', content: new TextEncoder().encode('{}') }], commandsRun: ['validate'], testResults: [{ name: 'schema', passed: true }] };
    const a = buildArtifactManifest(params); const b = buildArtifactManifest({ ...params, files: [{ ...params.files[0], content: new TextEncoder().encode('{"ok":true}') }] });
    expect(a.submissionHash).not.toBe(b.submissionHash); expect(a.files[0].sha256).toHaveLength(64);
    expect(() => buildArtifactManifest({ ...params, testResults: [{ name: 'schema', passed: false }] })).toThrow('EVIDENCE_REQUIRED');
  });
  it('blocks private-key material from previews and evidence without echoing it', async () => {
    const material = { ['private' + 'Key']: 'not-an-actual-secret' };
    expect(() => assertNoSecretMaterial(material)).toThrow('SECRET_MATERIAL_FORBIDDEN');
    await expect(callTaskmarketTool('taskmarket_action_preview', material)).rejects.toThrow('SECRET_MATERIAL_FORBIDDEN');
  });
  it('does not synthesize opportunities or a successful code fix', async () => {
    const scout = new SwarmScoutAgent(); expect(await scout.discoverFromGithubLeads()).toEqual([]);
    expect(await scout.discoverFromInboundLeads()).toEqual([]); expect(await scout.discoverFromMcpRegistry()).toEqual([]);
    await expect(new SwarmExecutionAgent().executePaidService({ capability: 'gxeon_quick_fix_v1', input: {}, settlementProof: { verified: true } })).rejects.toThrow('REVIEWED_CODE_AND_TEST_EVIDENCE');
  });
});

describe('scheduler authentication', () => {
  const claims = () => ({ iss: 'https://token.actions.githubusercontent.com', aud: POLL_AUDIENCE,
    sub: 'repo:xpex-systems-ai/GXEON-Wallet-Command-Center:ref:refs/heads/main', repository: 'xpex-systems-ai/GXEON-Wallet-Command-Center',
    repository_id: '1388515959', repository_owner_id: '265388597', ref: 'refs/heads/main',
    workflow_ref: 'xpex-systems-ai/GXEON-Wallet-Command-Center/.github/workflows/taskmarket-radar.yml@refs/heads/main',
    event_name: 'schedule', iat: Math.floor(Date.now() / 1000), nbf: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 });
  it('rejects forks, other workflows, PRs, expired or unsigned tokens', async () => {
    expect(validateSchedulerClaims(claims())).toBe(true);
    for (const change of [{ repository_id: '999' }, { event_name: 'pull_request' }, { workflow_ref: 'other' }, { exp: 1 }, { aud: 'other' }]) expect(validateSchedulerClaims({ ...claims(), ...change })).toBe(false);
    expect(await authorizeRadarPoll('Bearer invalid')).toBe(false);
    expect(await authorizeRadarPoll(undefined)).toBe(false);
  });
  it('verifies the RSA signature against issuer keys, not just JWT claims', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', kid: 'test' })).toString('base64url');
    const payload = Buffer.from(JSON.stringify(claims())).toString('base64url');
    const signature = sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey).toString('base64url');
    const fetcher = vi.fn(async () => response({ keys: [{ ...publicKey.export({ format: 'jwk' }), kid: 'test', use: 'sig' }] }));
    expect(await authorizeRadarPoll(`Bearer ${header}.${payload}.${signature}`, fetcher)).toBe(true);
    expect(await authorizeRadarPoll(`Bearer ${header}.${payload}.${Buffer.from('wrong').toString('base64url')}`, fetcher)).toBe(false);
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { BASE_BOUNTY_FEED, normalizeBaseBounty, normalizeUnifiedRadar, parseCatalog, parseSnapshot, reviewPack, safeSourceUrl } from '../src/features/revenue-operations/model';
import { readBaseBounty, readRevenueOperations, revenueOperationsHandler } from '../src/server/revenueOperations';

const now = Date.parse('2026-10-10T01:00:00Z');
const timestamp = new Date(now).toISOString();
const tx = '0x' + 'a'.repeat(64);
const opportunity = { provider: 'taskmarket', externalId: 'task-1', title: 'Audit a public API', url: 'https://taskmarket.dev/tasks/task-1', reward: 5, currency: 'USDC', fundingStatus: 'ONCHAIN_VERIFIED', claimStatus: 'AVAILABLE', deadline: '2026-10-11T00:00:00Z', evidence: { escrow: { verified: true, transactionHash: tx, checkedAt: timestamp } } };
const radar = (rows: unknown[] = [opportunity], fetchedAt = timestamp) => ({ fetchedAt, opportunities: rows });
const base = { chainId: 8453, testnet: false, readAt: timestamp, count: 0, bounties: [] };
const snapshot = () => {
  const b = normalizeBaseBounty(base, now); const u = normalizeUnifiedRadar(radar(), now);
  return { mode: 'READ_ONLY', observedAt: timestamp, sources: [u.source, b.source], opportunities: u.opportunities, ledger: 'AUTHENTICATED_RECONCILIATION_REQUIRED', agenticTrade: 'ACCOUNT_AND_PUBLICATION_NOT_VERIFIED' };
};
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('Contract qualification preserves financial boundaries', () => {
  it('keeps funding evidence separate from eligibility, approval and receipt', () => {
    const row = normalizeUnifiedRadar(radar(), now).opportunities[0];
    expect(row.funding).toBe('RADAR_ONCHAIN_EVIDENCE'); expect(row.state).toBe('UNDER_REVIEW'); expect(row.network).toBeNull(); expect(row.eligibilityVerified).toBeNull(); expect(row.initialCostRequired).toBeNull();
    expect(reviewPack(row)).toMatchObject({ status: 'UNSENT', humanApprovalRequired: true, claimed: false, accepted: false, settled: false, revenue: null });
  });
  it('does not trust a funding status without the underlying transaction evidence', () => {
    expect(normalizeUnifiedRadar(radar([{ ...opportunity, evidence: {} }]), now).opportunities[0].funding).toBe('UNKNOWN');
  });
  it('marks a snapshot old rather than calling it live', () => {
    const result = normalizeUnifiedRadar(radar([opportunity], '2026-10-09T01:00:00Z'), now);
    expect(result.source.status).toBe('STALE'); expect(result.opportunities[0].stale).toBe(true);
  });
  it('treats future timestamps as stale', () => expect(normalizeUnifiedRadar(radar([opportunity], '2026-10-11T00:00:00Z'), now).source.status).toBe('STALE'));
  it('never represents a failed or missing feed as a verified zero', () => {
    for (const value of [null, {}, { opportunities: [] }, { fetchedAt: timestamp, opportunities: [null] }]) expect(normalizeUnifiedRadar(value, now).source).toMatchObject({ status: 'UNAVAILABLE', count: null });
  });
  it('deduplicates the same provider record and rejects conflicting evidence', () => {
    expect(normalizeUnifiedRadar(radar([opportunity, opportunity]), now).opportunities).toHaveLength(1);
    expect(normalizeUnifiedRadar(radar([opportunity, { ...opportunity, reward: 999 }]), now).source.count).toBeNull();
  });
  it('marks expired tasks independently of advertised funding', () => expect(normalizeUnifiedRadar(radar([{ ...opportunity, deadline: '2026-10-09T00:00:00Z' }]), now).opportunities[0].state).toBe('EXPIRED'));
  it.each(['initialCostRequired', 'claimBondRequired'])('blocks verified initial cost: %s', field => expect(normalizeUnifiedRadar(radar([{ ...opportunity, evidence: { [field]: true } }]), now).opportunities[0].state).toBe('BLOCKED_BY_COST'));
  it.each([-1, NaN, Infinity, '5', 0])('does not invent a reward from %s', reward => expect(normalizeUnifiedRadar(radar([{ ...opportunity, reward }]), now).opportunities[0].reward).toBeNull());
  it.each(['javascript:alert(1)', 'https://taskmarket.dev.evil.example/task', 'https://u:p@taskmarket.dev/task', 'https://taskmarket.dev:8443/task', 'http://taskmarket.dev/task'])('rejects unsafe evidence links: %s', url => expect(safeSourceUrl(url, 'taskmarket')).toBeNull());
});
describe('BaseBounty public read is not contract permission', () => {
  it('distinguishes an actual empty response from an unavailable source', () => {
    expect(normalizeBaseBounty(base, now).source).toMatchObject({ status: 'AVAILABLE', count: 0 });
    expect(normalizeBaseBounty(null, now).source).toMatchObject({ status: 'UNAVAILABLE', count: null });
  });
  it('blocks gas-required claims and does not infer an escrow balance from metadata', () => {
    const result = normalizeBaseBounty({ ...base, count: 1, bounties: [{ jobId: '1', title: 'Build API', rewardUsdc: '100' }] }, now);
    expect(result.opportunities[0]).toMatchObject({ state: 'BLOCKED_BY_COST', initialCostRequired: true, funding: 'UNKNOWN', reward: null });
  });
  it.each([{ testnet: true }, { chainId: 1 }, { count: 1 }, { bounties: [null], count: 1 }])('fails closed on an inconsistent Base feed: %j', change => expect(normalizeBaseBounty({ ...base, ...change }, now).source.count).toBeNull());
});
describe('Public snapshot and catalog validation', () => {
  it('accepts a valid read-only snapshot', () => expect(parseSnapshot(snapshot()).mode).toBe('READ_ONLY'));
  it('rejects operational/financial claims outside the read-only contract', () => {
    expect(() => parseSnapshot({ ...snapshot(), ledger: 'SETTLED' })).toThrow();
    expect(() => parseSnapshot({ ...snapshot(), opportunities: [{ ...snapshot().opportunities[0], state: 'APPROVED_TO_CLAIM' }] })).toThrow();
    expect(() => parseSnapshot({ ...snapshot(), opportunities: [{ ...snapshot().opportunities[0], fundingTx: null }] })).toThrow();
  });
  it('rejects duplicate opportunity identities and unknown currency shapes', () => {
    const row = snapshot().opportunities[0];
    expect(() => parseSnapshot({ ...snapshot(), opportunities: [row, row] })).toThrow();
    expect(() => parseSnapshot({ ...snapshot(), opportunities: [{ ...row, currency: {} }] })).toThrow();
  });
  it('validates service metadata without equating catalog presence to paid sales', () => {
    const s = { serviceId: 'gxeon_api_health_v1', name: 'Health', unitPriceCredits: 10, status: 'AVAILABLE' };
    expect(parseCatalog({ services: [s] })).toHaveLength(1);
    expect(() => parseCatalog({ services: [s, s] })).toThrow(); expect(() => parseCatalog({ services: {} })).toThrow();
  });
});
describe('Read-only endpoint', () => {
  it('allows GET of only the fixed public API and rejects redirects/non-JSON', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(base), { headers: { 'content-type': 'application/json' } })); vi.stubGlobal('fetch', fetchMock);
    await expect(readBaseBounty()).resolves.toEqual(base);
    expect(fetchMock.mock.calls[0][0]).toBe(BASE_BOUNTY_FEED); expect(fetchMock.mock.calls[0][1]).toMatchObject({ method: 'GET', redirect: 'error' });
    fetchMock.mockResolvedValue(new Response('<html/>')); await expect(readBaseBounty()).rejects.toThrow();
  });
  it('limits public response size', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(' '.repeat(1_000_001), { headers: { 'content-type': 'application/json' } })));
    await expect(readBaseBounty()).rejects.toThrow('PUBLIC_READ_TOO_LARGE');
  });
  it('keeps errors per source and returns unknown metrics without private reads', async () => {
    vi.stubEnv('FIREBASE_PROJECT_ID', ''); vi.stubEnv('GCP_PROJECT_ID', ''); vi.stubEnv('GCP_WIF_AUDIENCE', '');
    const fetchMock = vi.fn().mockRejectedValue(new Error('offline')); vi.stubGlobal('fetch', fetchMock);
    const result = await readRevenueOperations(); expect(result.sources.every(s => s.count === null)).toBe(true); expect(result.ledger).toBe('AUTHENTICATED_RECONCILIATION_REQUIRED'); expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it.each(['POST', 'PUT', 'DELETE'])('rejects %s before any provider call', async method => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); const res = { statusCode: 0, setHeader: vi.fn(), end: vi.fn() };
    expect(await revenueOperationsHandler({ method, query: { view: 'revenue-operations' } }, res)).toBe(true); expect(res.statusCode).toBe(405); expect(fetchMock).not.toHaveBeenCalled();
  });
});

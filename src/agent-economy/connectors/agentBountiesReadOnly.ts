/** Public discovery only. No claims, wallet signatures, or spending. */
const FEED_URL = 'https://api.agentbounties.app/v1/base/autonomous-bounties/feed?network=base-mainnet&claimable_only=true';
export type AgentBountiesCandidate = { id: string; raw: Record<string, unknown>; reviewStatus: 'REVIEW_REQUIRED' };
export async function getAgentBountiesReadOnlyFeed(): Promise<{provider:'AgentBounties'; checkedAt:string; status:'REVIEW_REQUIRED'|'UNAVAILABLE'; candidates:AgentBountiesCandidate[]; error?:string}> {
  const checkedAt = new Date().toISOString();
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    let response: Response;
    try {
      response = await fetch(FEED_URL, { method: 'GET', headers: {Accept:'application/json'}, redirect:'error', cache:'no-store', signal:controller.signal });
    } finally { clearTimeout(timer); }
    if (!response.ok) throw new Error('HTTP_' + response.status);
    const len = Number(response.headers.get('content-length') || 0);
    if (len > 1_000_000) throw new Error('RESPONSE_TOO_LARGE');
    const raw = await response.text();
    if (raw.length > 1_000_000) throw new Error('RESPONSE_TOO_LARGE');
    const data: unknown = JSON.parse(raw);
    const rows = Array.isArray(data) ? data : data && typeof data === 'object' && Array.isArray((data as any).bounties) ? (data as any).bounties : data && typeof data === 'object' && Array.isArray((data as any).items) ? (data as any).items : null;
    if (!rows) throw new Error('UNRECOGNIZED_FEED_SCHEMA');
    const candidates = rows.slice(0, 100).filter((item:unknown): item is Record<string,unknown> => !!item && typeof item === 'object' && !Array.isArray(item)).map((item, index) => ({
      id: String(item.id || item.bounty_id || item.contract || 'unidentified_' + index),
      raw: item,
      reviewStatus: 'REVIEW_REQUIRED' as const,
    }));
    return {provider:'AgentBounties', checkedAt, status:'REVIEW_REQUIRED', candidates};
  } catch (error) {
    return {provider:'AgentBounties', checkedAt, status:'UNAVAILABLE', candidates:[], error:error instanceof Error ? error.message : 'READ_FAILED'};
  }
}

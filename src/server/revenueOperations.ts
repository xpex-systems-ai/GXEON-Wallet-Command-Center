import { FirestoreRestClient, isFirestoreRestConfigured } from '../../api/_firestoreRest.js';
import { BASE_BOUNTY_FEED, normalizeBaseBounty, normalizeUnifiedRadar, type RevenueSnapshot } from '../features/revenue-operations/model.js';

// Only fixed public-market URLs and an existing public radar document are read.
// No provider credentials, private account data, writes, claims or paid API calls.
export async function readBaseBounty(): Promise<unknown> {
  const response = await fetch(BASE_BOUNTY_FEED, { method: 'GET', headers: { Accept: 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(7000) });
  if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) throw new Error('PUBLIC_READ_UNAVAILABLE');
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let length = 0;
  try {
    while (true) { const { value, done } = await reader.read(); if (done) break; length += value.length; if (length > 1_000_000) throw new Error('PUBLIC_READ_TOO_LARGE'); chunks.push(value); }
  } finally { await reader.cancel(); }
  const data = new Uint8Array(length); let position = 0;
  for (const chunk of chunks) { data.set(chunk, position); position += chunk.length; }
  return JSON.parse(new TextDecoder().decode(data));
}
export async function readRevenueOperations(): Promise<RevenueSnapshot> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cachedRadar = new Promise<unknown>((resolve) => {
    timer = setTimeout(() => resolve(null), 9000);
    if (!isFirestoreRestConfigured()) { resolve(null); return; }
    new FirestoreRestClient().get<unknown>('marketplace_agent_state', 'unified').then(d => resolve(d?.data ?? null), () => resolve(null));
  }).finally(() => clearTimeout(timer));
  const [base, unified] = await Promise.allSettled([
    readBaseBounty(),
    cachedRadar,
  ]);
  const now = Date.now();
  const b = normalizeBaseBounty(base.status === 'fulfilled' ? base.value : null, now);
  const u = normalizeUnifiedRadar(unified.status === 'fulfilled' ? unified.value : null, now);
  return { mode: 'READ_ONLY', observedAt: new Date(now).toISOString(), sources: [u.source, b.source], opportunities: [...u.opportunities, ...b.opportunities], ledger: 'AUTHENTICATED_RECONCILIATION_REQUIRED', agenticTrade: 'ACCOUNT_AND_PUBLICATION_NOT_VERIFIED' };
}
export async function revenueOperationsHandler(req: any, res: any): Promise<boolean> {
  if (req.query?.view !== 'revenue-operations') return false;
  res.setHeader('Content-Type', 'application/json'); res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); res.statusCode = 405; res.end(JSON.stringify({ error: 'READ_ONLY_ENDPOINT' })); return true; }
  try { res.statusCode = 200; res.end(JSON.stringify(await readRevenueOperations())); }
  catch { res.statusCode = 503; res.end(JSON.stringify({ error: 'REVENUE_READ_UNAVAILABLE' })); }
  return true;
}

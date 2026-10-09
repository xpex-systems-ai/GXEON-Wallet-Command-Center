import { COMMUNITY_COMMAND_URL } from '../features/integrations/catalog.js';
import { coinbaseConfiguration, IntegrationReadError, readCoinbase, requireIntegrationOperator } from './coinbaseReadOnly.js';
import { readCoinbaseHistory } from './coinbaseHistory.js';

export async function ecosystemIntegrationHandler(req: any, res: any): Promise<boolean> {
  const view = req.query?.view;
  if (view !== 'ecosystem' && view !== 'coinbase' && view !== 'coinbase-history') return false;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('Vary', 'Authorization');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET'); res.statusCode = 405;
    res.end(JSON.stringify({ error: 'READ_ONLY_ENDPOINT' })); return true;
  }
  try {
    if (view === 'coinbase' || view === 'coinbase-history') {
      await requireIntegrationOperator(req.headers?.authorization);
      res.statusCode = 200;
      res.end(JSON.stringify(view === 'coinbase' ? await readCoinbase() : await readCoinbaseHistory()));
    } else {
      let available = false;
      try {
        const response = await fetch(new URL('/api/health', COMMUNITY_COMMAND_URL), { signal: AbortSignal.timeout(4000), redirect: 'error' });
        const health = response.ok ? await response.json() : null;
        available = health?.status === 'ok' && health?.database === 'connected' && health?.environment === 'staging';
      } catch { /* Failed probes remain unavailable. */ }
      res.statusCode = 200;
      res.end(JSON.stringify({ observedAt: new Date().toISOString(), communityCommand: { status: available ? 'AVAILABLE' : 'UNAVAILABLE', environment: 'staging', url: COMMUNITY_COMMAND_URL, dataSync: 'AUTHENTICATED_SESSION_REQUIRED' }, coinbase: coinbaseConfiguration() }));
    }
  } catch (error) {
    res.statusCode = error instanceof IntegrationReadError ? error.status : 502;
    res.end(JSON.stringify({ error: error instanceof IntegrationReadError ? error.message : 'INTEGRATION_READ_UNAVAILABLE' }));
  }
  return true;
}

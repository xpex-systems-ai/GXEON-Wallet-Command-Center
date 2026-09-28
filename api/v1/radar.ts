import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { ingestDemandSignal, RawDemandSignal } from '../../src/agent-economy/demandRadar.js';
import { fetchAndIngestX402Demand } from '../../src/agent-economy/connectors/x402BazaarConnector.js';
import { getAgentEconomyStore } from '../../src/agent-economy/store.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
  const flags = getFeatureFlags();
  if (!flags.demandRadarEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Demand Radar is disabled');
    return;
  }

  const store = getAgentEconomyStore();

  if (req.method === 'GET') {
    const url = new URL(req.url, 'http://localhost');
    const refresh = url.searchParams.get('refresh') === 'true';
    let opportunities = await store.listOpportunities();
    if (opportunities.length === 0 || refresh) {
      try {
        await fetchAndIngestX402Demand();
        opportunities = await store.listOpportunities();
      } catch (err) {
        console.warn('[RADAR] Live x402 fetch error:', err);
      }
    }
    sendJson(res, 200, {
      total: opportunities.length,
      opportunities,
    });
    return;
  }

  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    const auth = await authenticateMachineRequest(authHeader);
    if (!auth.authenticated || !auth.context) {
      const status = auth.statusCode || 401;
      const err = auth.error?.error || { code: 'AUTH_REQUIRED', message: 'Authentication failed' };
      sendError(res, status, err.code, err.message);
      return;
    }

    const body = (await parseBody(req)) as RawDemandSignal;
    if (!body || !body.source || !body.title || !body.rawDescription) {
      sendError(
        res,
        400,
        'INVALID_INPUT',
        'Required fields: source, sourceUrl, title, rawDescription'
      );
      return;
    }

    const opportunity = await ingestDemandSignal(body);
    sendJson(res, 201, opportunity);
    return;
  }

  sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
}

import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { getAgentEconomyStore } from '../../src/agent-economy/store.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError } from './_helper.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const auth = await authenticateMachineRequest(authHeader, 'results:read');
  if (!auth.authenticated || !auth.context) {
    const status = auth.statusCode || 401;
    const err = auth.error?.error || { code: 'AUTH_REQUIRED', message: 'Authentication failed' };
    sendError(res, status, err.code, err.message);
    return;
  }

  const { account } = auth.context;
  const url = new URL(req.url, 'http://localhost');
  const jobId = url.searchParams.get('jobId') || req.query?.jobId;

  if (!jobId) {
    sendError(res, 400, 'INVALID_INPUT', 'Missing jobId parameter');
    return;
  }

  const store = getAgentEconomyStore();
  const job = await store.getJob(jobId);

  // Multi-tenant isolation: Agent A must NEVER see Agent B results
  if (!job || job.accountId !== account.accountId) {
    sendError(res, 404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
    return;
  }

  const result = await store.getJobResult(jobId);
  if (!result) {
    sendJson(res, 200, {
      jobId,
      state: job.state,
      message: 'Job result is not yet available',
    });
    return;
  }

  sendJson(res, 200, result);
}

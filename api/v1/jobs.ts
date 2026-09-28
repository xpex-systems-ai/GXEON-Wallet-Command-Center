import { authenticateMachineRequest, checkRateLimit } from '../../src/agent-economy/auth.js';
import { submitJobAdmission } from '../../src/agent-economy/admissionService.js';
import { getAgentEconomyStore } from '../../src/agent-economy/store.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;

  // --- GET /v1/jobs or /v1/jobs?jobId=... ---
  if (req.method === 'GET') {
    const auth = await authenticateMachineRequest(authHeader, 'jobs:read');
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

    // Multi-tenant isolation: Agent A must NEVER see Agent B jobs
    if (!job || job.accountId !== account.accountId) {
      sendError(res, 404, 'JOB_NOT_FOUND', `Job ${jobId} not found`);
      return;
    }

    sendJson(res, 200, job);
    return;
  }

  // --- POST /v1/jobs ---
  if (req.method === 'POST') {
    const auth = await authenticateMachineRequest(authHeader, 'jobs:create');
    if (!auth.authenticated || !auth.context) {
      const status = auth.statusCode || 401;
      const err = auth.error?.error || { code: 'AUTH_REQUIRED', message: 'Authentication failed' };
      sendError(res, status, err.code, err.message);
      return;
    }

    const { account } = auth.context;

    // Rate Limiting
    const rateLimit = checkRateLimit(account.accountId, 'job', 30);
    if (!rateLimit.allowed) {
      sendJson(
        res,
        429,
        {
          error: {
            code: 'RATE_LIMITED',
            message: `Too many job submissions. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
          },
        },
        {
          'Retry-After': String(rateLimit.retryAfterSeconds),
          'X-RateLimit-Limit': String(rateLimit.limit),
          'X-RateLimit-Remaining': '0',
        }
      );
      return;
    }

    const body = await parseBody(req);
    if (!body) {
      sendError(res, 400, 'INVALID_INPUT', 'Malformed or empty JSON body');
      return;
    }

    const idempotencyKey =
      req.headers['idempotency-key'] || req.headers['Idempotency-Key'];

    const admission = await submitJobAdmission({
      accountId: account.accountId,
      quoteId: body.quoteId,
      input: body.input,
      idempotencyKey,
      waitForExecution: false,
    });

    if (!admission.success) {
      const err = admission.error?.error || {
        code: 'ADMISSION_FAILED',
        message: 'Job admission failed',
      };
      sendError(res, admission.statusCode, err.code, err.message);
      return;
    }

    sendJson(res, admission.statusCode, {
      jobId: admission.job!.jobId,
      state: admission.job!.state,
      totalCreditsReserved: admission.totalCreditsReserved,
    });
    return;
  }

  sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
}

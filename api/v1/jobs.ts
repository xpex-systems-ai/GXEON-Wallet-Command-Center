import crypto from 'node:crypto';
import { authenticateMachineRequest, checkRateLimit } from '../../src/agent-economy/auth.js';
import { validateQuote } from '../../src/agent-economy/quoteEngine.js';
import { reserveCredits } from '../../src/agent-economy/ledger.js';
import { checkIdempotency, recordIdempotency } from '../../src/agent-economy/idempotency.js';
import { getAgentEconomyStore } from '../../src/agent-economy/store.js';
import { getGxeonCommander } from '../../src/agent-economy/commander.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { Job } from '../../src/agent-economy/types.js';
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

    // Check Idempotency
    const idemCheck = await checkIdempotency(idempotencyKey, account.accountId, body);
    if (idemCheck.hasConflict) {
      sendError(
        res,
        409,
        'IDEMPOTENCY_CONFLICT',
        idemCheck.conflictError?.error.message || 'Idempotency conflict detected'
      );
      return;
    }
    if (idemCheck.isExisting && idemCheck.cachedResponse) {
      sendJson(res, idemCheck.cachedResponse.statusCode, idemCheck.cachedResponse.body);
      return;
    }

    const { quoteId, input } = body;
    if (!quoteId || typeof quoteId !== 'string') {
      sendError(res, 400, 'INVALID_INPUT', 'Missing or invalid quoteId');
      return;
    }
    if (!input || typeof input !== 'object') {
      sendError(res, 400, 'INVALID_INPUT', 'Missing or invalid input object');
      return;
    }

    // Validate quote
    const quoteCheck = await validateQuote(quoteId, account.accountId);
    if (!quoteCheck.valid || !quoteCheck.quote) {
      const code = quoteCheck.errorCode || 'QUOTE_INVALID';
      sendError(res, 400, code, quoteCheck.message || 'Invalid quote');
      return;
    }

    const quote = quoteCheck.quote;
    const jobId = `job_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

    // Atomically reserve credits
    const reserveResult = await reserveCredits(
      account.accountId,
      quote.totalCredits,
      jobId,
      quote.quoteId
    );

    if (!reserveResult.success) {
      sendError(
        res,
        402,
        'INSUFFICIENT_CREDITS',
        reserveResult.error?.error.message || 'Insufficient credits for job'
      );
      return;
    }

    const now = new Date().toISOString();
    const job: Job = {
      jobId,
      accountId: account.accountId,
      serviceId: quote.serviceId,
      quoteId: quote.quoteId,
      state: 'QUEUED',
      financialState: 'CREDITS_RESERVED',
      input,
      createdAt: now,
      updatedAt: now,
      idempotencyKey,
    };

    const store = getAgentEconomyStore();
    await store.saveJob(job);

    // Asynchronously dispatch to Commander
    const commander = getGxeonCommander();
    commander.processJob(jobId).catch((err) => {
      console.error(`[COMMANDER DISPATCH ERROR] Job ${jobId}:`, err);
    });

    const responsePayload = {
      jobId,
      state: 'QUEUED',
      totalCreditsReserved: quote.totalCredits,
    };

    await recordIdempotency(idempotencyKey, account.accountId, body, responsePayload, 202);
    sendJson(res, 202, responsePayload);
    return;
  }

  sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
}

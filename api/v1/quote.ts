import { authenticateMachineRequest, checkRateLimit } from '../../src/agent-economy/auth.js';
import { createQuote } from '../../src/agent-economy/quoteEngine.js';
import { checkIdempotency, recordIdempotency } from '../../src/agent-economy/idempotency.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const auth = await authenticateMachineRequest(authHeader, 'quotes:create');
  if (!auth.authenticated || !auth.context) {
    const status = auth.statusCode || 401;
    const err = auth.error?.error || {
      code: 'AUTH_REQUIRED',
      message: 'Authentication failed',
    };
    sendError(res, status, err.code, err.message);
    return;
  }

  const { account } = auth.context;

  // Rate Limiting
  const rateLimit = checkRateLimit(account.accountId, 'request', 60);
  if (!rateLimit.allowed) {
    sendJson(
      res,
      429,
      {
        error: {
          code: 'RATE_LIMITED',
          message: `Too many quote requests. Try again in ${rateLimit.retryAfterSeconds} seconds.`,
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

  const { serviceId, quantity } = body;
  if (!serviceId || typeof serviceId !== 'string') {
    sendError(res, 400, 'INVALID_INPUT', 'Missing or invalid serviceId');
    return;
  }

  const result = await createQuote({
    accountId: account.accountId,
    serviceId,
    quantity: Number(quantity),
  });

  if (!result.success || !result.quote) {
    const code = result.errorCode || 'INVALID_INPUT';
    const status = code === 'SERVICE_NOT_FOUND' ? 404 : 400;
    sendError(res, status, code, result.message || 'Failed to create quote');
    return;
  }

  await recordIdempotency(idempotencyKey, account.accountId, body, result.quote, 201);
  sendJson(res, 201, result.quote);
}

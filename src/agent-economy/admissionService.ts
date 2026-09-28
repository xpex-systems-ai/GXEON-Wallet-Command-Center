import crypto from 'node:crypto';
import {
  Job,
  JobResult,
  GxeonErrorResponse,
} from './types.js';
import { getService } from './services/registry.js';
import { validateQuote } from './quoteEngine.js';
import { reserveCredits } from './ledger.js';
import { checkIdempotency, recordIdempotency } from './idempotency.js';
import { getAgentEconomyStore } from './store.js';
import { getGxeonCommander } from './commander.js';

export interface SubmitJobParams {
  accountId: string;
  quoteId: string;
  input: Record<string, unknown>;
  idempotencyKey?: string;
  waitForExecution?: boolean;
}

export interface JobAdmissionResponse {
  success: boolean;
  statusCode: number;
  job?: Job;
  result?: JobResult;
  totalCreditsReserved?: number;
  totalCreditsSettled?: number;
  error?: GxeonErrorResponse;
}

/**
 * Unified capability admission layer for REST and MCP.
 * Implements strict server-calculated unit verification, idempotency,
 * atomic credit reservation, and bounded execution with durable leasing.
 */
export async function submitJobAdmission(
  params: SubmitJobParams
): Promise<JobAdmissionResponse> {
  const { accountId, quoteId, input, idempotencyKey, waitForExecution = true } = params;

  if (!quoteId || typeof quoteId !== 'string') {
    return {
      success: false,
      statusCode: 400,
      error: {
        error: { code: 'INVALID_INPUT', message: 'Missing or invalid quoteId' },
      },
    };
  }

  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {
      success: false,
      statusCode: 400,
      error: {
        error: { code: 'INVALID_INPUT', message: 'Input must be a valid JSON object' },
      },
    };
  }

  const store = getAgentEconomyStore();
  const quote = await store.getQuote(quoteId);

  if (!quote || quote.accountId !== accountId) {
    return {
      success: false,
      statusCode: 400,
      error: {
        error: { code: 'QUOTE_INVALID', message: 'Quote does not exist or belongs to another account' },
      },
    };
  }

  const service = getService(quote.serviceId);
  if (!service) {
    return {
      success: false,
      statusCode: 404,
      error: {
        error: { code: 'SERVICE_NOT_FOUND', message: `Unknown service ${quote.serviceId}` },
      },
    };
  }

  // 1. Calculate actual unit quantity from payload
  let actualQuantity = 1;
  if (service.serviceId === 'gxeon_url_verify_v1') {
    const urls = input.urls;
    if (!Array.isArray(urls) || urls.length === 0) {
      return {
        success: false,
        statusCode: 400,
        error: {
          error: { code: 'INVALID_INPUT', message: 'Field urls must be a non-empty array' },
        },
      };
    }
    actualQuantity = urls.length;
  } else if (service.serviceId === 'gxeon_api_health_v1') {
    const endpoints = input.endpoints;
    if (!Array.isArray(endpoints) || endpoints.length === 0) {
      return {
        success: false,
        statusCode: 400,
        error: {
          error: { code: 'INVALID_INPUT', message: 'Field endpoints must be a non-empty array' },
        },
      };
    }
    actualQuantity = endpoints.length;
  }

  // 2. Validate quote with server-calculated quantity
  const quoteCheck = await validateQuote(quoteId, accountId, actualQuantity);
  if (!quoteCheck.valid) {
    return {
      success: false,
      statusCode: 400,
      error: {
        error: {
          code: quoteCheck.errorCode || 'QUOTE_INVALID',
          message: quoteCheck.message || 'Quote validation failed',
        },
      },
    };
  }

  // 3. Idempotency Check
  const idempotencyPayload = { quoteId, input };
  const idemCheck = await checkIdempotency(idempotencyKey, accountId, idempotencyPayload);
  if (idemCheck.hasConflict) {
    return {
      success: false,
      statusCode: 409,
      error: {
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message: idemCheck.conflictError?.error.message || 'Idempotency conflict detected',
        },
      },
    };
  }
  if (idemCheck.isExisting && idemCheck.cachedResponse) {
    return {
      success: true,
      statusCode: idemCheck.cachedResponse.statusCode,
      job: idemCheck.cachedResponse.body as Job,
    };
  }

  const jobId = `job_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;

  // 4. Atomic Credit Reservation
  const reserveResult = await reserveCredits(
    accountId,
    quote.totalCredits,
    jobId,
    quote.quoteId
  );

  if (!reserveResult.success) {
    return {
      success: false,
      statusCode: 402,
      error: {
        error: {
          code: 'INSUFFICIENT_CREDITS',
          message: reserveResult.error?.error.message || 'Insufficient credits for job',
        },
      },
    };
  }

  const now = new Date().toISOString();
  const job: Job = {
    jobId,
    accountId,
    serviceId: quote.serviceId,
    quoteId: quote.quoteId,
    state: 'QUEUED',
    financialState: 'CREDITS_RESERVED',
    input,
    createdAt: now,
    updatedAt: now,
    idempotencyKey,
  };

  await store.saveJob(job);

  // 5. Create Durable Outbox Record
  await store.saveOutboxJob({
    outboxId: `out_${jobId}`,
    jobId,
    status: 'PENDING',
    attemptCount: 0,
    createdAt: now,
  });

  const commander = getGxeonCommander();

  if (waitForExecution) {
    // Synchronous execution path (bounded by timeout) prevents detached serverless aborts
    const execResult = await commander.processJob(jobId);
    const responsePayload = {
      jobId,
      state: execResult.job.state,
      totalCreditsSettled: execResult.job.state === 'COMPLETED' ? quote.totalCredits : 0,
      result: execResult.result,
    };

    await recordIdempotency(idempotencyKey, accountId, idempotencyPayload, responsePayload, 200);

    return {
      success: true,
      statusCode: 200,
      job: execResult.job,
      result: execResult.result,
      totalCreditsSettled: execResult.job.state === 'COMPLETED' ? quote.totalCredits : 0,
    };
  }

  // Asynchronous queue path with background processing
  commander.processJob(jobId).catch((err) => {
    console.error(`[COMMANDER ASYNC ERROR] Job ${jobId}:`, err);
  });

  const queuedPayload = {
    jobId,
    state: 'QUEUED',
    totalCreditsReserved: quote.totalCredits,
  };

  await recordIdempotency(idempotencyKey, accountId, idempotencyPayload, queuedPayload, 202);

  return {
    success: true,
    statusCode: 202,
    job,
    totalCreditsReserved: quote.totalCredits,
  };
}

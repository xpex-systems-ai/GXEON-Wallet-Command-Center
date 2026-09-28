import crypto from 'node:crypto';
import { getAgentEconomyStore } from './store.js';
import { GxeonErrorResponse } from './types.js';

export function hashPayload(payload: unknown): string {
  const jsonStr = JSON.stringify(payload ?? null);
  return crypto.createHash('sha256').update(jsonStr).digest('hex');
}

export interface IdempotencyCheckResult {
  hasConflict: boolean;
  isExisting: boolean;
  cachedResponse?: {
    statusCode: number;
    body: unknown;
  };
  conflictError?: GxeonErrorResponse;
}

export async function checkIdempotency(
  idempotencyKey: string | undefined,
  accountId: string,
  payload: unknown
): Promise<IdempotencyCheckResult> {
  if (!idempotencyKey || !idempotencyKey.trim()) {
    return { hasConflict: false, isExisting: false };
  }

  const cleanKey = idempotencyKey.trim();
  const currentPayloadHash = hashPayload(payload);
  const store = getAgentEconomyStore();

  const record = await store.getIdempotencyRecord(cleanKey, accountId);
  if (!record) {
    return { hasConflict: false, isExisting: false };
  }

  if (record.payloadHash !== currentPayloadHash) {
    return {
      hasConflict: true,
      isExisting: false,
      conflictError: {
        error: {
          code: 'IDEMPOTENCY_CONFLICT',
          message:
            'A request with this Idempotency-Key was already executed with a different payload.',
        },
      },
    };
  }

  return {
    hasConflict: false,
    isExisting: true,
    cachedResponse: {
      statusCode: record.statusCode,
      body: record.responseBody,
    },
  };
}

export async function recordIdempotency(
  idempotencyKey: string | undefined,
  accountId: string,
  payload: unknown,
  responseBody: unknown,
  statusCode: number
): Promise<void> {
  if (!idempotencyKey || !idempotencyKey.trim()) return;

  const store = getAgentEconomyStore();
  await store.saveIdempotencyRecord({
    idempotencyKey: idempotencyKey.trim(),
    accountId,
    payloadHash: hashPayload(payload),
    responseBody,
    statusCode,
    createdAt: new Date().toISOString(),
  });
}

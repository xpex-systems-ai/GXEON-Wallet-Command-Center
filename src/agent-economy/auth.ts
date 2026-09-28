import crypto from 'node:crypto';
import {
  AgentAccount,
  ApiKeyRecord,
  AgentScope,
  GxeonErrorResponse,
} from './types.js';
import { getAgentEconomyStore } from './store.js';

export function hashApiKey(rawKey: string): string {
  return crypto.createHash('sha256').update(rawKey.trim()).digest('hex');
}

export function generateApiKey(): { rawKey: string; keyRecord: Omit<ApiKeyRecord, 'accountId' | 'scopes'> } {
  const random = crypto.randomBytes(24).toString('hex');
  const rawKey = `gxa_live_${random}`;
  const hashedKey = hashApiKey(rawKey);
  const keyId = `key_${crypto.randomBytes(8).toString('hex')}`;
  const prefix = rawKey.slice(0, 12);

  return {
    rawKey,
    keyRecord: {
      keyId,
      hashedKey,
      prefix,
      createdAt: new Date().toISOString(),
    },
  };
}

// In-memory sliding window rate limiter
interface RateLimitWindow {
  requests: number[];
  jobs: number[];
}

const rateLimitWindows = new Map<string, RateLimitWindow>();

export interface RateLimitCheckResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(
  accountId: string,
  type: 'request' | 'job' = 'request',
  limitPerMinute = 60
): RateLimitCheckResult {
  const now = Date.now();
  const windowMs = 60_000;
  const cutoff = now - windowMs;

  let win = rateLimitWindows.get(accountId);
  if (!win) {
    win = { requests: [], jobs: [] };
    rateLimitWindows.set(accountId, win);
  }

  const list = type === 'job' ? win.jobs : win.requests;
  // Prune old timestamps
  const active = list.filter((t) => t > cutoff);
  if (type === 'job') win.jobs = active;
  else win.requests = active;

  if (active.length >= limitPerMinute) {
    const oldest = active[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    return {
      allowed: false,
      limit: limitPerMinute,
      remaining: 0,
      retryAfterSeconds: retryAfter,
    };
  }

  active.push(now);
  return {
    allowed: true,
    limit: limitPerMinute,
    remaining: limitPerMinute - active.length,
    retryAfterSeconds: 0,
  };
}

export interface AuthContext {
  account: AgentAccount;
  apiKey: ApiKeyRecord;
}

export interface AuthResult {
  authenticated: boolean;
  context?: AuthContext;
  error?: GxeonErrorResponse;
  statusCode?: number;
}

/**
 * Validates request authentication credentials and required scopes.
 */
export async function authenticateMachineRequest(
  authHeader: string | undefined,
  requiredScope?: AgentScope
): Promise<AuthResult> {
  if (!authHeader) {
    return {
      authenticated: false,
      statusCode: 401,
      error: {
        error: {
          code: 'AUTH_REQUIRED',
          message: 'Missing Authorization header. Expected Bearer gxa_live_...',
        },
      },
    };
  }

  const rawKey = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!rawKey.startsWith('gxa_live_')) {
    return {
      authenticated: false,
      statusCode: 401,
      error: {
        error: {
          code: 'INVALID_API_KEY',
          message: 'API key must match format gxa_live_<token>',
        },
      },
    };
  }

  const store = getAgentEconomyStore();
  const hashed = hashApiKey(rawKey);
  const keyRecord = await store.getApiKeyByHash(hashed);

  if (!keyRecord) {
    return {
      authenticated: false,
      statusCode: 401,
      error: {
        error: {
          code: 'INVALID_API_KEY',
          message: 'Provided API key does not exist or was revoked',
        },
      },
    };
  }

  if (keyRecord.revokedAt) {
    return {
      authenticated: false,
      statusCode: 401,
      error: {
        error: {
          code: 'INVALID_API_KEY',
          message: 'API key has been revoked',
        },
      },
    };
  }

  const account = await store.getAccount(keyRecord.accountId);
  if (!account) {
    return {
      authenticated: false,
      statusCode: 401,
      error: {
        error: {
          code: 'INVALID_API_KEY',
          message: 'Associated agent account not found',
        },
      },
    };
  }

  if (account.status !== 'ACTIVE') {
    return {
      authenticated: false,
      statusCode: 403,
      error: {
        error: {
          code: 'ACCOUNT_SUSPENDED',
          message: `Agent account status is ${account.status}`,
        },
      },
    };
  }

  if (requiredScope) {
    const hasScope =
      keyRecord.scopes.includes(requiredScope) || keyRecord.scopes.includes('admin:*');
    if (!hasScope) {
      return {
        authenticated: false,
        statusCode: 403,
        error: {
          error: {
            code: 'SCOPE_DENIED',
            message: `API key lacks required scope: ${requiredScope}`,
          },
        },
      };
    }
  }

  // Update lastUsedAt asynchronously
  keyRecord.lastUsedAt = new Date().toISOString();
  store.saveApiKey(keyRecord).catch(() => {});

  return {
    authenticated: true,
    context: {
      account,
      apiKey: keyRecord,
    },
  };
}

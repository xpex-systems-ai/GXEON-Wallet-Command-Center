import { createPrivateKey, randomBytes, sign, verify } from 'node:crypto';
import type { CoinbaseRead } from '../features/integrations/catalog.js';

const paths = ['/api/v3/brokerage/accounts', '/api/v3/brokerage/orders/historical/batch'] as const;
const certificatesUrl = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
let certificates: { keys: Record<string, string>; expiresAt: number } | null = null;

export class IntegrationReadError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export function coinbaseConfiguration() {
  const raw = process.env.GXEON_COINBASE_CONNECTOR_VERIFIED_AT || '';
  const timestamp = Date.parse(raw);
  return {
    connectorVerifiedAt: Number.isFinite(timestamp) && timestamp <= Date.now() ? new Date(timestamp).toISOString() : null,
    runtimeConfigured: Boolean(process.env.COINBASE_READ_API_KEY_NAME?.trim() && process.env.COINBASE_READ_API_KEY_SECRET?.trim()),
    operatorAuthConfigured: Boolean(process.env.GXEON_OPERATOR_UID?.trim() && process.env.FIREBASE_PROJECT_ID?.trim()),
    mode: 'READ_ONLY' as const,
  };
}

// An authenticated Firebase user is insufficient: the configured operator UID
// must also match. Public/local/native UI modes never authorize this read.
export async function requireIntegrationOperator(authorization: unknown): Promise<void> {
  const projectId = process.env.FIREBASE_PROJECT_ID?.trim();
  const operatorUid = process.env.GXEON_OPERATOR_UID?.trim();
  if (!projectId || !operatorUid) throw new IntegrationReadError(503, 'OPERATOR_AUTH_CONFIGURATION_REQUIRED');
  if (typeof authorization !== 'string' || !/^Bearer [\w.-]+$/.test(authorization) || authorization.length > 8192) {
    throw new IntegrationReadError(401, 'OPERATOR_SIGN_IN_REQUIRED');
  }
  try {
    const parts = authorization.slice(7).split('.');
    if (parts.length !== 3) throw new Error('format');
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    const now = Date.now() / 1000;
    if (header.alg !== 'RS256' || typeof header.kid !== 'string' ||
        claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}` ||
        claims.sub !== operatorUid || typeof claims.sub !== 'string' || !claims.sub ||
        !Number.isFinite(claims.exp) || claims.exp <= now ||
        !Number.isFinite(claims.iat) || claims.iat > now ||
        !Number.isFinite(claims.auth_time) || claims.auth_time > now) throw new Error('claims');
    if (!certificates || certificates.expiresAt <= Date.now()) {
      const response = await fetch(certificatesUrl, { signal: AbortSignal.timeout(5000), redirect: 'error' });
      if (!response.ok) throw new Error('certificates');
      const seconds = Number(response.headers.get('cache-control')?.match(/max-age=(\d+)/)?.[1] || 0);
      certificates = { keys: await response.json(), expiresAt: Date.now() + Math.min(seconds, 3600) * 1000 };
    }
    const certificate = Object.prototype.hasOwnProperty.call(certificates.keys, header.kid) ? certificates.keys[header.kid] : null;
    if (!certificate || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), certificate, Buffer.from(parts[2], 'base64url'))) throw new Error('signature');
  } catch {
    throw new IntegrationReadError(401, 'OPERATOR_AUTHENTICATION_FAILED');
  }
}

export function buildCoinbaseReadJwt(path: string): string {
  if (!paths.includes(path as typeof paths[number])) throw new IntegrationReadError(400, 'READ_ENDPOINT_NOT_ALLOWED');
  const name = process.env.COINBASE_READ_API_KEY_NAME?.trim();
  const secret = process.env.COINBASE_READ_API_KEY_SECRET?.replace(/\\n/g, '\n').trim();
  if (!name || !secret) throw new IntegrationReadError(503, 'COINBASE_RUNTIME_CREDENTIAL_REQUIRED');
  const key = createPrivateKey(secret);
  if (key.asymmetricKeyType !== 'ec' || key.asymmetricKeyDetails?.namedCurve !== 'prime256v1') throw new IntegrationReadError(503, 'COINBASE_ES256_KEY_REQUIRED');
  const now = Math.floor(Date.now() / 1000);
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const input = `${encode({ alg: 'ES256', typ: 'JWT', kid: name, nonce: randomBytes(16).toString('hex') })}.${encode({ sub: name, iss: 'cdp', nbf: now, exp: now + 120, uri: `GET api.coinbase.com${path}` })}`;
  return `${input}.${sign('sha256', Buffer.from(input), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

async function readPages(path: typeof paths[number], field: 'accounts' | 'orders', signal: AbortSignal): Promise<Record<string, any>[]> {
  const rows: Record<string, any>[] = [];
  const seen = new Set<string>();
  let cursor = '';
  for (let page = 0; page < 20; page++) {
    const url = new URL(path, 'https://api.coinbase.com');
    url.searchParams.set('limit', '100');
    if (field === 'orders') url.searchParams.set('order_status', 'OPEN');
    if (cursor) url.searchParams.set('cursor', cursor);
    const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${buildCoinbaseReadJwt(path)}`, Accept: 'application/json' }, signal, redirect: 'error', cache: 'no-store' });
    if (!response.ok) throw new IntegrationReadError(502, 'COINBASE_READ_UNAVAILABLE');
    const body = await response.json();
    if (!Array.isArray(body[field]) || typeof body.has_next !== 'boolean') throw new IntegrationReadError(502, 'COINBASE_RESPONSE_INVALID');
    rows.push(...body[field]);
    if (!body.has_next) return rows;
    if (typeof body.cursor !== 'string' || !body.cursor || seen.has(body.cursor)) break;
    cursor = body.cursor; seen.add(cursor);
  }
  // Partial pagination must never be reported as a complete balance/order read.
  throw new IntegrationReadError(502, 'COINBASE_PAGINATION_INCOMPLETE');
}

function amount(value: unknown): string {
  if (typeof value !== 'string' || !/^\d+(\.\d+)?$/.test(value)) throw new IntegrationReadError(502, 'COINBASE_AMOUNT_INVALID');
  return value;
}

export async function readCoinbase(): Promise<CoinbaseRead> {
  const signal = AbortSignal.timeout(12000);
  const [accounts, orders] = await Promise.all([readPages(paths[0], 'accounts', signal), readPages(paths[1], 'orders', signal)]);
  const ids = new Set<string>();
  const safeAccounts = accounts.filter(account => account.active !== false).map(account => {
    if (typeof account.uuid !== 'string' || ids.has(account.uuid) || typeof account.currency !== 'string' || !/^[A-Z0-9]{2,12}$/.test(account.currency) || account.available_balance?.currency !== account.currency || account.hold?.currency !== account.currency) throw new IntegrationReadError(502, 'COINBASE_RESPONSE_INVALID');
    ids.add(account.uuid);
    return { currency: account.currency, available: amount(account.available_balance.value), hold: amount(account.hold.value) };
  });
  if (orders.some(order => order.status !== 'OPEN' || typeof order.order_id !== 'string') || new Set(orders.map(order => order.order_id)).size !== orders.length) throw new IntegrationReadError(502, 'COINBASE_RESPONSE_INVALID');
  return { status: 'VERIFIED', observedAt: new Date().toISOString(), scope: 'API_KEY_PORTFOLIO', accounts: safeAccounts, openOrders: orders.length };
}

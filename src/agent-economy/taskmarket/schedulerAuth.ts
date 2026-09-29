import { createPublicKey, timingSafeEqual, verify } from 'node:crypto';

export const POLL_AUDIENCE = 'https://gxeon-wallet-command-center.vercel.app/api/cron/taskmarket-radar';
const ISSUER = 'https://token.actions.githubusercontent.com';
const REPO = 'xpex-systems-ai/GXEON-Wallet-Command-Center';
const REPO_ID = '1388515959';
const OWNER_ID = '265388597';
export interface OidcClaims { [key: string]: unknown }
export function validateSchedulerClaims(c: OidcClaims, now = Math.floor(Date.now() / 1000)): boolean {
  const subjects = [`repo:${REPO}:ref:refs/heads/main`, `repo:xpex-systems-ai@${OWNER_ID}/GXEON-Wallet-Command-Center@${REPO_ID}:ref:refs/heads/main`];
  return c.iss === ISSUER && c.aud === POLL_AUDIENCE && c.repository === REPO && c.repository_id === REPO_ID &&
    c.repository_owner_id === OWNER_ID && c.ref === 'refs/heads/main' &&
    c.workflow_ref === `${REPO}/.github/workflows/taskmarket-radar.yml@refs/heads/main` &&
    subjects.includes(String(c.sub)) && ['schedule', 'workflow_dispatch', 'push'].includes(String(c.event_name)) &&
    typeof c.exp === 'number' && c.exp > now && typeof c.nbf === 'number' && c.nbf <= now + 5 &&
    typeof c.iat === 'number' && c.iat <= now + 5 && c.iat >= now - 600 && c.exp - c.iat <= 600;
}

export async function authorizeRadarPoll(header: unknown, fetcher: typeof fetch = fetch): Promise<boolean> {
  if (typeof header !== 'string' || !header.startsWith('Bearer ') || header.length > 16000) return false;
  const token = header.slice(7);
  const secret = process.env.CRON_SECRET;
  if (secret && Buffer.byteLength(token) === Buffer.byteLength(secret) && timingSafeEqual(Buffer.from(token), Buffer.from(secret))) return true;
  try {
    const parts = token.split('.'); if (parts.length !== 3) return false;
    const h = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
    if (h.alg !== 'RS256' || typeof h.kid !== 'string') return false;
    const response = await fetcher(`${ISSUER}/.well-known/jwks`, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) return false;
    const jwks = await response.json() as { keys: Array<JsonWebKey & { kid: string; use?: string; alg?: string }> };
    const key = jwks.keys.find(k => k.kid === h.kid && k.kty === 'RSA' && k.use === 'sig');
    if (!key || !verify('RSA-SHA256', Buffer.from(`${parts[0]}.${parts[1]}`), createPublicKey({ key, format: 'jwk' }), Buffer.from(parts[2], 'base64url'))) return false;
    return validateSchedulerClaims(JSON.parse(Buffer.from(parts[1], 'base64url').toString()));
  } catch { return false; }
}

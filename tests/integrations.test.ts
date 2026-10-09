import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { buildCoinbaseReadJwt, coinbaseConfiguration, readCoinbase, requireIntegrationOperator } from '../src/server/coinbaseReadOnly';
import { ecosystemIntegrationHandler } from '../src/server/ecosystemIntegration';
import { COMMUNITY_COMMAND_URL, parseCoinbaseRead, parseEcosystemStatus } from '../src/features/integrations/catalog';

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
function credentials() {
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  vi.stubEnv('COINBASE_READ_API_KEY_NAME', 'organizations/test/apiKeys/read');
  vi.stubEnv('COINBASE_READ_API_KEY_SECRET', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  return publicKey;
}
function response() {
  return { statusCode: 0, headers: {} as Record<string, string>, body: '', setHeader(name: string, value: string) { this.headers[name] = value; }, end(body: string) { this.body = body; } };
}
describe('Central integrations security and money truth', () => {
  it('rejects the Firebase Hosting legacy status before the UI stores it', () => {
    expect(() => parseEcosystemStatus({ stripeConfigured: true, realRevenue: 'R$0.00' })).toThrow('Status das integrações indisponível');
    for (const value of [null, [], { coinbase: null, communityCommand: null }]) expect(() => parseEcosystemStatus(value)).toThrow();
    expect(parseEcosystemStatus({ observedAt: '2026-10-09T05:00:00Z', communityCommand: { status: 'UNAVAILABLE', environment: 'staging', url: COMMUNITY_COMMAND_URL, dataSync: 'AUTHENTICATED_SESSION_REQUIRED' }, coinbase: { connectorVerifiedAt: null, runtimeConfigured: false, operatorAuthConfigured: false, mode: 'READ_ONLY' } }).coinbase.runtimeConfigured).toBe(false);
  });
  it('does not accept legacy or malformed responses as verified private balances', () => {
    const valid = { status: 'VERIFIED', observedAt: '2026-10-09T05:00:00Z', scope: 'API_KEY_PORTFOLIO', openOrders: 0, accounts: [{ accountId: 'brl', portfolioId: null, network: null, currency: 'BRL', available: '0', hold: '0' }] };
    expect(parseCoinbaseRead(valid)).toEqual(valid);
    for (const value of [{ stripeConfigured: true }, { ...valid, accounts: null }, { ...valid, openOrders: -1 }, { ...valid, accounts: [{ currency: 'USDC', available: null, hold: '0' }] }]) expect(() => parseCoinbaseRead(value)).toThrow('Nenhum saldo foi confirmado');
  });
  it('does not mistake connector verification for runtime authorization', () => {
    vi.stubEnv('GXEON_COINBASE_CONNECTOR_VERIFIED_AT', '2026-10-01T00:00:00Z');
    vi.stubEnv('COINBASE_READ_API_KEY_NAME', ''); vi.stubEnv('COINBASE_READ_API_KEY_SECRET', ''); vi.stubEnv('GXEON_OPERATOR_UID', '');
    expect(coinbaseConfiguration()).toMatchObject({ connectorVerifiedAt: '2026-10-01T00:00:00.000Z', runtimeConfigured: false, operatorAuthConfigured: false });
    vi.stubEnv('GXEON_COINBASE_CONNECTOR_VERIFIED_AT', 'invalid');
    expect(coinbaseConfiguration().connectorVerifiedAt).toBeNull();
  });
  it('exposes only non-financial configuration in the public view', async () => {
    credentials(); vi.stubEnv('GXEON_OPERATOR_UID', 'secret-owner'); vi.stubEnv('FIREBASE_PROJECT_ID', 'test');
    vi.stubEnv('GXEON_COINBASE_USDC_AVAILABLE_SNAPSHOT', '99999');
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'ok', database: 'connected', environment: 'staging' })));
    vi.stubGlobal('fetch', fetcher);
    const res = response();
    expect(await ecosystemIntegrationHandler({ method: 'GET', query: { view: 'ecosystem' } }, res)).toBe(true);
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body).communityCommand.status).toBe('AVAILABLE');
    expect(res.body).not.toMatch(/99999|secret-owner|available_balance|apiKeys|BEGIN/);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('blocks unauthenticated private reads before touching Coinbase', async () => {
    credentials(); vi.stubEnv('GXEON_OPERATOR_UID', 'owner'); vi.stubEnv('FIREBASE_PROJECT_ID', 'test');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const res = response();
    await ecosystemIntegrationHandler({ method: 'GET', query: { view: 'coinbase' }, headers: {} }, res);
    expect(res.statusCode).toBe(401); expect(fetcher).not.toHaveBeenCalled();
    expect(res.headers['Cache-Control']).toBe('private, no-store');
  });
  it('blocks all write methods on integration views', async () => {
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    const res = response();
    await ecosystemIntegrationHandler({ method: 'POST', query: { view: 'coinbase' }, headers: {} }, res);
    expect(res.statusCode).toBe(405); expect(fetcher).not.toHaveBeenCalled();
  });
  it('verifies operator identity, audience and the signature, not just JWT decoding', async () => {
    vi.stubEnv('GXEON_OPERATOR_UID', 'owner'); vi.stubEnv('FIREBASE_PROJECT_ID', 'test');
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ test: publicKey.export({ type: 'spki', format: 'pem' }).toString() })));
    vi.stubGlobal('fetch', fetcher);
    const now = Math.floor(Date.now() / 1000) - 1;
    const make = (changes: Record<string, unknown> = {}) => {
      const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
      const input = `${enc({ alg: 'RS256', kid: 'test' })}.${enc({ sub: 'owner', aud: 'test', iss: 'https://securetoken.google.com/test', exp: now + 300, iat: now, auth_time: now, ...changes })}`;
      return `Bearer ${input}.${sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64url')}`;
    };
    await expect(requireIntegrationOperator(make())).resolves.toBeUndefined();
    for (const claims of [{ sub: 'other-owner' }, { aud: 'other-project' }, { exp: now - 1 }]) await expect(requireIntegrationOperator(make(claims))).rejects.toMatchObject({ status: 401 });
    await expect(requireIntegrationOperator(`${make().slice(0, -12)}invalidsig`)).rejects.toMatchObject({ status: 401 });
  });
  it('signs a GET-only JWT bound to the allowed Coinbase endpoint', () => {
    const publicKey = credentials();
    const jwt = buildCoinbaseReadJwt('/api/v3/brokerage/accounts');
    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header, 'base64url').toString()).alg).toBe('ES256');
    expect(JSON.parse(Buffer.from(claims, 'base64url').toString()).uri).toBe('GET api.coinbase.com/api/v3/brokerage/accounts');
    expect(verify('sha256', Buffer.from(`${header}.${claims}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url'))).toBe(true);
    expect(() => buildCoinbaseReadJwt('/api/v3/brokerage/orders')).toThrow('READ_ENDPOINT_NOT_ALLOWED');
  });
  it('reads all pages and preserves asset amounts without invented USDC', async () => {
    credentials();
    const fetcher = vi.fn().mockImplementation(async (url: URL, options: RequestInit) => {
      expect(options.method).toBe('GET'); expect(url.hostname).toBe('api.coinbase.com');
      if (url.pathname.endsWith('/accounts')) return new Response(JSON.stringify(url.searchParams.has('cursor')
        ? { accounts: [{ uuid: 'brl', currency: 'BRL', available_balance: { currency: 'BRL', value: '0' }, hold: { currency: 'BRL', value: '0' } }], has_next: false }
        : { accounts: [{ uuid: 'btc', currency: 'BTC', available_balance: { currency: 'BTC', value: '0.123456789123456789' }, hold: { currency: 'BTC', value: '0.1' } }], has_next: true, cursor: 'next' }));
      expect(url.searchParams.get('order_status')).toBe('OPEN');
      return new Response(JSON.stringify({ orders: [], has_next: false }));
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await readCoinbase();
    expect(result.accounts).toEqual([{ accountId: 'btc', portfolioId: null, network: null, currency: 'BTC', available: '0.123456789123456789', hold: '0.1' }, { accountId: 'brl', portfolioId: null, network: null, currency: 'BRL', available: '0', hold: '0' }]);
    expect(result.scope).toBe('API_KEY_PORTFOLIO'); expect(result.openOrders).toBe(0);
    expect(JSON.stringify(result)).not.toMatch(/uuid|USDC|Base/); expect(fetcher).toHaveBeenCalledTimes(3);
  });
  it('rejects incomplete pagination instead of showing a false verified total', async () => {
    credentials();
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: URL) => new Response(JSON.stringify(url.pathname.endsWith('/accounts') ? { accounts: [], has_next: true, cursor: 'repeated' } : { orders: [], has_next: false }))));
    await expect(readCoinbase()).rejects.toThrow('COINBASE_PAGINATION_INCOMPLETE');
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { buildCoinbaseReadJwt, configuredHistoryAccounts } from '../src/server/coinbaseReadOnly';
import { readCoinbaseHistory } from '../src/server/coinbaseHistory';
import { ecosystemIntegrationHandler } from '../src/server/ecosystemIntegration';
import { isCoinbaseReceipt, parseCoinbaseHistory } from '../src/features/integrations/catalog';

const account = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const path = `/v2/accounts/${account}/transactions`;
const transaction = { id: 'payment-1', type: 'receive', status: 'completed', amount: { currency: 'USDC', amount: '0.123456' }, created_at: '2026-10-09T01:00:00Z' };
function setup() {
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  vi.stubEnv('COINBASE_READ_API_KEY_NAME', 'organizations/test/apiKeys/view');
  vi.stubEnv('COINBASE_READ_API_KEY_SECRET', privateKey.export({ type: 'pkcs8', format: 'pem' }).toString());
  vi.stubEnv('COINBASE_READ_TRANSACTION_ACCOUNT_IDS', account);
}
const page = (data: unknown[], next: string | null = null) => new Response(JSON.stringify({ data, pagination: { next_uri: next } }));
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe('Coinbase Track history and receipt evidence', () => {
  it('does not confuse trades, pending credits or internal transfers with receipts', () => {
    expect(isCoinbaseReceipt({ type: 'receive', status: 'completed', amount: '0.000001' })).toBe(true);
    for (const row of [{ ...transaction, amount: '1', type: 'buy' }, { ...transaction, amount: '1', type: 'transfer' }, { ...transaction, amount: '1', status: 'pending' }, { ...transaction, amount: '-1' }, { ...transaction, amount: '0.000000' }]) expect(isCoinbaseReceipt(row)).toBe(false);
  });
  it('requires explicitly verified account IDs and binds each GET JWT to that account', () => {
    setup(); expect(configuredHistoryAccounts()).toEqual([account]);
    expect(buildCoinbaseReadJwt(path)).toBeTruthy();
    for (const bad of [`/v2/accounts/${other}/transactions`, `${path}/payment-1`, `${path}?send=true`, '/v2/accounts/me/transactions']) expect(() => buildCoinbaseReadJwt(bad)).toThrow('READ_ENDPOINT_NOT_ALLOWED');
    vi.stubEnv('COINBASE_READ_TRANSACTION_ACCOUNT_IDS', `${account},${account}`);
    expect(() => configuredHistoryAccounts()).toThrow('COINBASE_HISTORY_ACCOUNT_CONFIGURATION_REQUIRED');
  });
  it('deduplicates overlapping provider records without promoting receipts to revenue or guessing Base', async () => {
    setup();
    const fetcher = vi.fn().mockImplementation(async (url: URL, options: RequestInit) => {
      expect(url.origin).toBe('https://api.coinbase.com'); expect(url.pathname).toBe(path); expect(options.method).toBe('GET');
      return url.searchParams.has('starting_after') ? page([transaction]) : page([transaction], `${path}?starting_after=payment-1`);
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await readCoinbaseHistory();
    expect(result.transactions).toHaveLength(1);
    expect(result.transactions[0]).toMatchObject({ accountId: account, amount: '0.123456', network: null, txHash: null, receiptStatus: 'PROVIDER_COMPLETED', revenueStatus: 'NOT_RECONCILED' });
    expect(result.reconciliation).toBe('AUTHENTICATED_LEDGER_LINK_REQUIRED');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('uses account and provider ID together so equal IDs in different accounts do not collide', async () => {
    setup(); vi.stubEnv('COINBASE_READ_TRANSACTION_ACCOUNT_IDS', `${account},${other}`);
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => page([transaction])));
    const result = await readCoinbaseHistory();
    expect(result.transactions).toHaveLength(2);
    expect(new Set(result.transactions.map(row => row.accountId)).size).toBe(2);
  });
  it('rejects conflicting duplicate records rather than silently double counting', async () => {
    setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([transaction, { ...transaction, amount: { currency: 'USDC', amount: '9' } }])));
    await expect(readCoinbaseHistory()).rejects.toThrow('COINBASE_HISTORY_DUPLICATE_CONFLICT');
  });
  it('rejects pagination redirects and incomplete responses without disclosing a partial history', async () => {
    setup();
    for (const next of [`https://evil.example${path}?starting_after=next`, `/v2/accounts/${other}/transactions?starting_after=next`, `${path}?starting_after=next&send=true`]) {
      const fetcher = vi.fn().mockResolvedValue(page([transaction], next)); vi.stubGlobal('fetch', fetcher);
      await expect(readCoinbaseHistory()).rejects.toThrow('COINBASE_HISTORY_PAGINATION_INCOMPLETE'); expect(fetcher).toHaveBeenCalledTimes(1);
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
    await expect(readCoinbaseHistory()).rejects.toThrow('COINBASE_HISTORY_RESPONSE_INVALID');
  });
  it('never turns an unauthorized or missing account scope into an empty verified history', async () => {
    setup(); vi.stubEnv('COINBASE_READ_TRANSACTION_ACCOUNT_IDS', '');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    await expect(readCoinbaseHistory()).rejects.toThrow('COINBASE_HISTORY_ACCOUNT_CONFIGURATION_REQUIRED'); expect(fetcher).not.toHaveBeenCalled();
    vi.stubEnv('COINBASE_READ_TRANSACTION_ACCOUNT_IDS', account); fetcher.mockResolvedValue(new Response('{}', { status: 403 }));
    await expect(readCoinbaseHistory()).rejects.toThrow('COINBASE_HISTORY_READ_UNAVAILABLE');
  });
  it('protects history with the same server operator gate and rejects writes', async () => {
    setup(); vi.stubEnv('FIREBASE_PROJECT_ID', 'project'); vi.stubEnv('GXEON_OPERATOR_UID', 'owner');
    const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
    for (const method of ['GET', 'POST', 'DELETE']) {
      const res = { statusCode: 0, body: '', headers: {} as Record<string, string>, setHeader(k: string, v: string) { this.headers[k] = v; }, end(body: string) { this.body = body; } };
      await ecosystemIntegrationHandler({ method, query: { view: 'coinbase-history' }, headers: {} }, res);
      expect(res.statusCode).toBe(method === 'GET' ? 401 : 405); expect(res.headers['Cache-Control']).toBe('private, no-store');
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('validates evidence again before UI state, blocking invented revenue and duplicated rows', async () => {
    setup(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(page([transaction])));
    const valid = await readCoinbaseHistory(); expect(parseCoinbaseHistory(valid)).toEqual(valid);
    for (const value of [{}, { ...valid, transactions: null }, { ...valid, transactions: [...valid.transactions, ...valid.transactions] }, { ...valid, transactions: valid.transactions.map(row => ({ ...row, revenueStatus: 'SETTLED' })) }, { ...valid, transactions: valid.transactions.map(row => ({ ...row, accountId: other })) }]) expect(() => parseCoinbaseHistory(value)).toThrow('Nenhum recebimento foi confirmado');
  });
});

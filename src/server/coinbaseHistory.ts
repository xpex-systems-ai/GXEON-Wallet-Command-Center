import { CoinbaseHistory, CoinbaseTransaction, isCoinbaseReceipt, parseCoinbaseHistory } from '../features/integrations/catalog.js';
import { buildCoinbaseReadJwt, configuredHistoryAccounts, IntegrationReadError } from './coinbaseReadOnly.js';

// Deliberately separate from the brokerage account IDs. Track API account IDs
// must be verified by the operator, permissioned by Coinbase and allowlisted.
export async function readCoinbaseHistory(): Promise<CoinbaseHistory> {
  const accountIds = configuredHistoryAccounts();
  const rows = new Map<string, CoinbaseTransaction>();
  const signal = AbortSignal.timeout(12000);
  for (const accountId of accountIds) {
    const path = `/v2/accounts/${accountId}/transactions`;
    let cursor = '';
    const cursors = new Set<string>();
    let complete = false;
    for (let page = 0; page < 20; page++) {
      const url = new URL(path, 'https://api.coinbase.com');
      url.searchParams.set('limit', '100'); url.searchParams.set('order', 'desc');
      if (cursor) url.searchParams.set('starting_after', cursor);
      const response = await fetch(url, { method: 'GET', headers: { Authorization: `Bearer ${buildCoinbaseReadJwt(path)}`, Accept: 'application/json' }, signal, redirect: 'error', cache: 'no-store' });
      if (!response.ok) throw new IntegrationReadError(502, 'COINBASE_HISTORY_READ_UNAVAILABLE');
      const body = await response.json();
      if (!Array.isArray(body.data) || body.data.length > 100 || !body.pagination || !Object.prototype.hasOwnProperty.call(body.pagination, 'next_uri')) throw new IntegrationReadError(502, 'COINBASE_HISTORY_RESPONSE_INVALID');
      for (const row of body.data) {
        if (!row || typeof row !== 'object' || !row.amount ||
            (row.resource_path != null && row.resource_path !== `${path}/${row.id}`)) throw new IntegrationReadError(502, 'COINBASE_HISTORY_RESPONSE_INVALID');
        const transaction: CoinbaseTransaction = {
          id: row.id, accountId, currency: row.amount.currency, amount: row.amount.amount,
          type: row.type, status: row.status, createdAt: row.created_at,
          network: row.network?.network_name ?? null, networkStatus: row.network?.status ?? null, txHash: row.network?.hash ?? null,
          receiptStatus: isCoinbaseReceipt({ type: row.type, status: row.status, amount: row.amount.amount }) ? 'PROVIDER_COMPLETED' : 'NOT_CONFIRMED',
          revenueStatus: 'NOT_RECONCILED',
        };
        const key = `${accountId}:${row.id}`;
        const existing = rows.get(key);
        // Overlapping pagination is safe only when the provider record agrees.
        if (existing && JSON.stringify(existing) !== JSON.stringify(transaction)) throw new IntegrationReadError(502, 'COINBASE_HISTORY_DUPLICATE_CONFLICT');
        rows.set(key, transaction);
        if (rows.size > 2000) throw new IntegrationReadError(502, 'COINBASE_HISTORY_PAGINATION_INCOMPLETE');
      }
      const nextUri = body.pagination.next_uri;
      if (nextUri === null || nextUri === '') { complete = true; break; }
      if (typeof nextUri !== 'string' || nextUri.length > 2048) throw new IntegrationReadError(502, 'COINBASE_HISTORY_PAGINATION_INCOMPLETE');
      // Never follow a provider URL directly or forward credentials to it.
      const next = new URL(nextUri, 'https://api.coinbase.com');
      const nextCursor = next.searchParams.get('starting_after');
      if (next.origin !== 'https://api.coinbase.com' || next.pathname !== path || next.hash || next.username || next.password ||
          !nextCursor || !/^[A-Za-z0-9_-]{1,128}$/.test(nextCursor) || cursors.has(nextCursor) ||
          [...next.searchParams.keys()].some(key => !['starting_after', 'limit', 'order'].includes(key))) throw new IntegrationReadError(502, 'COINBASE_HISTORY_PAGINATION_INCOMPLETE');
      cursors.add(nextCursor); cursor = nextCursor;
    }
    if (!complete) throw new IntegrationReadError(502, 'COINBASE_HISTORY_PAGINATION_INCOMPLETE');
  }
  try {
    return parseCoinbaseHistory({ status: 'VERIFIED', observedAt: new Date().toISOString(), source: 'COINBASE_TRACK_API', scope: 'CONFIGURED_ACCOUNTS', accountIds, transactions: [...rows.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)), reconciliation: 'AUTHENTICATED_LEDGER_LINK_REQUIRED' });
  } catch { throw new IntegrationReadError(502, 'COINBASE_HISTORY_RESPONSE_INVALID'); }
}

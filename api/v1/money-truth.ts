import { FirestoreRestClient, isFirestoreRestConfigured } from '../_firestoreRest.js';

const DEFAULT_RTC_WALLET = 'RTC82c21b7f32d0e65c4aa9785d6561a55ff6127269';
const RUSTCHAIN_BASE_URL = 'https://rustchain.org';

interface RustChainBalanceResponse {
  amount_i64?: number;
  amount_rtc?: number;
  miner_id?: string;
}

interface RustChainHistoryResponse {
  total?: number;
  transactions?: Array<Record<string, unknown>>;
}

async function fetchJson<T>(url: string, timeoutMs = 8_000): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP_${response.status}`);
    return (await response.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function numericEnv(name: string): number | null {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('Content-Type', 'application/json');

  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.end(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }));
    return;
  }

  const observedAt = new Date().toISOString();
  const rtcWallet = String(process.env.GXEON_RTC_WALLET || DEFAULT_RTC_WALLET).trim();

  let rtc: Record<string, unknown> = {
    asset: 'RTC',
    address: rtcWallet,
    balance: null,
    status: 'UNAVAILABLE',
    source: 'rustchain.org',
    verifiedAt: null,
    historyCount: null,
    experimentalToken: true,
  };

  try {
    const [balance, history] = await Promise.all([
      fetchJson<RustChainBalanceResponse>(
        `${RUSTCHAIN_BASE_URL}/wallet/balance?address=${encodeURIComponent(rtcWallet)}`
      ),
      fetchJson<RustChainHistoryResponse>(
        `${RUSTCHAIN_BASE_URL}/wallet/history?address=${encodeURIComponent(rtcWallet)}&limit=50`
      ).catch(() => ({ total: undefined, transactions: [] })),
    ]);

    if (
      typeof balance.amount_rtc === 'number' &&
      Number.isFinite(balance.amount_rtc) &&
      balance.miner_id === rtcWallet
    ) {
      rtc = {
        asset: 'RTC',
        address: rtcWallet,
        balance: String(balance.amount_rtc),
        amountI64: balance.amount_i64 ?? null,
        status: 'CONFIRMED',
        source: 'rustchain.org wallet API',
        verifiedAt: observedAt,
        historyCount:
          typeof history.total === 'number'
            ? history.total
            : Array.isArray(history.transactions)
              ? history.transactions.length
              : null,
        experimentalToken: true,
      };
    }
  } catch (error) {
    rtc = {
      ...rtc,
      error: error instanceof Error ? error.message : 'RTC_READ_FAILED',
    };
  }

  let settledUsdc = 0;
  let settledUsdcCount = 0;
  let unifiedRadar: Record<string, unknown> | null = null;
  let firestoreStatus = 'UNAVAILABLE';

  if (isFirestoreRestConfigured()) {
    try {
      const client = new FirestoreRestClient();
      const revenueDocs = await client.list<{ amountUsdc: number; status: string }>('machine_revenue');
      for (const item of revenueDocs) {
        if (
          item.data.status === 'SETTLED' &&
          typeof item.data.amountUsdc === 'number' &&
          Number.isFinite(item.data.amountUsdc) &&
          item.data.amountUsdc >= 0
        ) {
          settledUsdc += item.data.amountUsdc;
          settledUsdcCount += 1;
        }
      }
      unifiedRadar = (await client.get<Record<string, unknown>>('marketplace_agent_state', 'unified'))?.data || null;
      firestoreStatus = 'CONNECTED';
    } catch {
      firestoreStatus = 'READ_FAILED';
    }
  }

  const coinbaseAvailableUsdc = numericEnv('GXEON_COINBASE_USDC_AVAILABLE_SNAPSHOT');
  const coinbaseHoldUsdc = numericEnv('GXEON_COINBASE_USDC_HOLD_SNAPSHOT');
  const coinbaseOpenOrders = numericEnv('GXEON_COINBASE_OPEN_ORDERS_SNAPSHOT');
  const coinbaseSnapshotAt = String(process.env.GXEON_COINBASE_SNAPSHOT_AT || '').trim() || null;
  const hasCoinbaseSnapshot =
    coinbaseAvailableUsdc !== null &&
    coinbaseHoldUsdc !== null &&
    coinbaseOpenOrders !== null &&
    Boolean(coinbaseSnapshotAt);

  res.statusCode = 200;
  res.end(
    JSON.stringify({
      observedAt,
      agent: {
        name: 'GXEON',
        mode: 'AUTONOMOUS_SAFE',
        defaultPolicy: 'READ_ONLY',
        status: 'ACTIVE',
        canScan: true,
        canQualify: true,
        canReconcile: true,
        canPrepareActions: true,
        requiresHumanApproval: [
          'CLAIM',
          'SIGNATURE',
          'TRADE',
          'TRANSFER',
          'WITHDRAWAL',
          'SPEND',
        ],
      },
      rtc,
      usdc: {
        asset: 'USDC',
        settledRevenue: settledUsdc.toFixed(6),
        settledPayments: settledUsdcCount,
        settlementSource: firestoreStatus === 'CONNECTED' ? 'GXEON machine_revenue ledger' : null,
        settlementStatus: firestoreStatus,
        coinbase: hasCoinbaseSnapshot
          ? {
              status: 'READ_ONLY_SNAPSHOT',
              available: coinbaseAvailableUsdc?.toFixed(6),
              hold: coinbaseHoldUsdc?.toFixed(6),
              openOrders: coinbaseOpenOrders,
              verifiedAt: coinbaseSnapshotAt,
              source: 'Coinbase GXEON read-only operator snapshot',
            }
          : {
              status: 'EXTERNAL_CONNECTOR_REQUIRED',
              available: null,
              hold: null,
              openOrders: null,
              verifiedAt: null,
              source: 'Coinbase is intentionally not queried from the public Vercel runtime without server-side read-only credentials.',
            },
      },
      radar: unifiedRadar,
      moneyTruth: {
        rtcIsFiatRevenue: false,
        opportunitiesAreRevenue: false,
        escrowIsRevenue: false,
        settledUsdcIsRevenue: true,
        stripeWebhookIsAuthoritativeForBrl: true,
        withdrawableRequiresDestinationBalanceConfirmation: true,
      },
    })
  );
}

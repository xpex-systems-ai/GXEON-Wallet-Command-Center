// GXEON_BOUNTY_LIVE_PROBE_DEPLOY_MARKER
import { paymentStoreConfigured, paymentStoreHealth } from './_store.js';
import { readOfficialBaseWallet } from '../src/agent-economy/baseWalletOnchain.js';
import { getCachedBasedAgentsSnapshot } from '../src/agent-economy/connectors/basedAgentsReadOnly.js';
import { FirestoreRestClient } from './_firestoreRest.js';
import type { CreditPurchase } from '../src/agent-economy/store.js';
import { readTaskmarketStatus } from '../src/agent-economy/taskmarket/taskmarketRadar.js';
import {
  callBountyTool,
  getBountyIntegrationStatus,
} from '../src/agent-economy/connectors/bountyMcpConnector.js';
import {
  getMergePayIntegrationStatus,
  listMergePayOpenBounties,
} from '../src/agent-economy/connectors/mergePayConnector.js';

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

async function fetchReadOnlyJson<T>(url: string, timeoutMs = 8000): Promise<T> {
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

function numericSnapshot(name: string): number | null {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  // Reuse this serverless function: avoid exceeding Vercel Hobby's function count.
  const view = String(req.query?.view || new URL(req.url || '/', 'http://localhost').searchParams.get('view') || '');
  if (view === 'base-wallet') {
    const wallet = await readOfficialBaseWallet();
    res.statusCode = wallet.status === 'CONFIRMED_ONCHAIN' ? 200 : 503;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(wallet));
    return;
  }
  // BasedAgents is public GET-only discovery. Reuse existing Vercel function.
  if (view === 'basedagents') {
    const snapshot = await getCachedBasedAgentsSnapshot();
    res.statusCode = snapshot.status === 'UNAVAILABLE' ? 503 : 200;
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(snapshot));
    return;
  }

  const durableStoreConfigured = paymentStoreConfigured();
  const firestoreConnected = durableStoreConfigured ? await paymentStoreHealth() : false;

  const stripeKey = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '').trim();
  const isLiveKey = stripeKey.startsWith('sk_live_') || stripeKey.startsWith('rk_live_');
  const stripeEnvironment = isLiveKey ? 'LIVE' : (stripeKey ? 'TEST' : 'UNCONFIGURED');

  let stripeGrossRevenue = 0;
  let stripeRefunds = 0;
  let successfulPayments = 0;
  let pendingPayments = 0;
  const failedPayments = 0;
  let creditsSold = 0;
  let creditsConsumed = 0;
  let jobsPaid = 0;
  let jobsDelivered = 0;

  let auditEvents: any[] = [];
  let auditOrders: any[] = [];
  let opportunitiesCount = 0;
  let qualifiedCount = 0;
  let x402SettledUsdc = 0;
  let x402SettledCount = 0;
  let jobs: any[] = [];
  let buyersCount = 0;
  let repeatBuyersCount = 0;
  let quotesCount = 0;
  let offersCount = 0;
  let unifiedRadar: Record<string, unknown> | null = null;

  let replaysBlocked = 0;
  let invalidPaymentsBlocked = 0;
  let circuitBreakerEvents = 0;
  let paymentChallenges = 0;

  if (firestoreConnected) {
    try {
      const client = new FirestoreRestClient();

      // 1. Demand Opportunities
      const oppDocs = await client.list<any>('demand_opportunities');
      const liveOppDocs = oppDocs.filter(op => !/example-org|fintechstartup|sample|synthetic|placeholder/i.test(`${op.data.source} ${op.data.sourceUrl}`));
      opportunitiesCount = liveOppDocs.length;
      for (const op of liveOppDocs) {
        if (op.data.kind === 'FUNDED_JOB' && ['QUALIFIED', 'READY_FOR_OPERATOR'].includes(op.data.status)) {
          qualifiedCount++;
        }
      }

      // 2. Stripe Events & Orders (BRL Rail)
      const events = await client.list<any>('stripe_events');
      const orders = await client.list<any>('orders');
      auditEvents = events.map(({ data }) => ({ eventId: data.eventId, type: data.type, processedAt: data.processedAt }));
      auditOrders = orders.map(({ data }) => ({ id: data.id, state: data.state, amountBrl: data.amountBrl, updatedAt: data.updatedAt }));
      const countedOrders = new Set<string>();

      for (const ev of events) {
        const orderId = (ev.data.metadata as any)?.orderId;
        const matchingOrder = orderId
          ? (orders.find((o) => (o.data as any).id === orderId)?.data as any)
          : null;

        const isLive =
          ev.data.livemode === true ||
          Boolean(matchingOrder?.stripeSessionId?.startsWith('cs_live_'));
        const isPaid =
          ev.data.payment_status === 'paid' ||
          matchingOrder?.state === 'PAYMENT_SUCCEEDED';
        const isBrl =
          (ev.data.currency || matchingOrder?.currency || '').toLowerCase() === 'brl';
        const isAmount49 =
          ev.data.amount === 4900 ||
          ev.data.amount_total === 4900 ||
          matchingOrder?.amountCents === 4900 || matchingOrder?.amountBrl === 49;

        if (
          ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(ev.data.type) &&
          !countedOrders.has(orderId) &&
          isLive &&
          isPaid &&
          isBrl &&
          isAmount49
        ) {
          countedOrders.add(orderId);
          successfulPayments++;
          stripeGrossRevenue += 49.00;
          jobsPaid++;
        } else if (ev.data.type === 'charge.refunded' && isLive) {
          stripeRefunds += 49.00;
        }
      }

      for (const ord of orders) {
        if (['CUSTOMER_CREATED', 'CHECKOUT_CREATED', 'PAYMENT_PENDING'].includes(ord.data.state)) {
          pendingPayments++;
        }
      }

      // 3. Jobs Execution Stats
      jobs = await client.list<{ state: string; completedAt?: string; startedAt?: string }>('jobs');
      for (const j of jobs) {
        if (['DELIVERED', 'COMPLETED'].includes(j.data.state)) {
          jobsDelivered++;
        }
      }

      // 4. Internal Credits Ledger
      const ledgerEntries = await client.listStrict<{ type: string; amountCredits: number; stripePurchase?: CreditPurchase; refundedCents?: number }>('credit_ledger');
      for (const entry of ledgerEntries) {
        if (entry.data.type === 'CREDIT') {
          creditsSold += (entry.data.amountCredits || 0);
          const purchase = entry.data.stripePurchase;
          if (purchase?.livemode === true && purchase.currency === 'brl') {
            stripeGrossRevenue += purchase.amountCents / 100;
            stripeRefunds += (entry.data.refundedCents || 0) / 100;
            successfulPayments++;
          }
        } else if (entry.data.type === 'DEBIT') {
          creditsConsumed += (entry.data.amountCredits || 0);
        }
      }

      // 5. Machine Revenue (USDC Rail - Section 10)
      const revenueDocs = await client.list<{ amountUsdc: number; status: string }>('machine_revenue');
      for (const rev of revenueDocs) {
        if (rev.data.status === 'SETTLED' && typeof rev.data.amountUsdc === 'number') {
          x402SettledUsdc += rev.data.amountUsdc;
          x402SettledCount++;
        }
      }

      // 6. Machine Customers (Section 31 Retention)
      const customerDocs = await client.list<{ jobsPurchased: number }>('machine_customers');
      buyersCount = customerDocs.length;
      for (const cust of customerDocs) {
        if (cust.data.jobsPurchased > 1) {
          repeatBuyersCount++;
        }
      }

      // 7. Security Metrics
      const secDoc = await client.get<any>('security_metrics', 'global');
      if (secDoc) {
        replaysBlocked = secDoc.data.replaysBlocked || 0;
        invalidPaymentsBlocked = secDoc.data.invalidPaymentsBlocked || 0;
        circuitBreakerEvents = secDoc.data.circuitBreakerEvents || 0;
        paymentChallenges = secDoc.data.paymentChallenges || 0;
      }

      // 8. Quotes & Offers count
      const quotesDocs = await client.list<any>('quotes');
      quotesCount = quotesDocs.length;
      const offersDocs = await client.list<any>('offers');
      offersCount = offersDocs.length;

      // Unified read-only radar snapshot
      unifiedRadar = (await client.get<Record<string, unknown>>('marketplace_agent_state', 'unified'))?.data || null;
    } catch (e) {
      console.warn('Failed to aggregate revenue metrics from Firestore:', e);
    }
  }

  const observedAt = new Date().toISOString();
  const rtcWallet = String(process.env.GXEON_RTC_WALLET || DEFAULT_RTC_WALLET).trim();

  let rtcSnapshot: Record<string, unknown> = {
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
      fetchReadOnlyJson<RustChainBalanceResponse>(
        `${RUSTCHAIN_BASE_URL}/wallet/balance?miner_id=${encodeURIComponent(rtcWallet)}`
      ),
      fetchReadOnlyJson<RustChainHistoryResponse>(
        `${RUSTCHAIN_BASE_URL}/wallet/history?miner_id=${encodeURIComponent(rtcWallet)}&limit=50`
      ).catch(() => ({ total: undefined, transactions: [] })),
    ]);

    if (
      typeof balance.amount_rtc === 'number' &&
      Number.isFinite(balance.amount_rtc) &&
      balance.miner_id === rtcWallet
    ) {
      rtcSnapshot = {
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
    rtcSnapshot = {
      ...rtcSnapshot,
      error: error instanceof Error ? error.message : 'RTC_READ_FAILED',
    };
  }

  const coinbaseAvailable = numericSnapshot('GXEON_COINBASE_USDC_AVAILABLE_SNAPSHOT');
  const coinbaseHold = numericSnapshot('GXEON_COINBASE_USDC_HOLD_SNAPSHOT');
  const coinbaseOpenOrders = numericSnapshot('GXEON_COINBASE_OPEN_ORDERS_SNAPSHOT');
  const coinbaseVerifiedAt = String(process.env.GXEON_COINBASE_SNAPSHOT_AT || '').trim() || null;
  const hasCoinbaseSnapshot =
    coinbaseAvailable !== null &&
    coinbaseHold !== null &&
    coinbaseOpenOrders !== null &&
    Boolean(coinbaseVerifiedAt);

  const moneyTruthSnapshot = {
    observedAt,
    agent: {
      name: 'GXEON',
      status: 'ACTIVE',
      mode: 'READ_ONLY',
      canScan: true,
      canQualify: true,
      canReconcile: true,
    },
    rtc: rtcSnapshot,
    usdc: {
      settledRevenue: x402SettledUsdc.toFixed(6),
      settledPayments: x402SettledCount,
      coinbase: hasCoinbaseSnapshot
        ? {
            status: 'READ_ONLY_SNAPSHOT',
            available: coinbaseAvailable?.toFixed(6),
            hold: coinbaseHold?.toFixed(6),
            openOrders: coinbaseOpenOrders,
            verifiedAt: coinbaseVerifiedAt,
          }
        : {
            status: 'EXTERNAL_CONNECTOR_REQUIRED',
            available: null,
            hold: null,
            openOrders: null,
            verifiedAt: null,
          },
    },
    radar: unifiedRadar,
  };

  const stripeNetRevenue = stripeGrossRevenue > stripeRefunds ? stripeGrossRevenue - stripeRefunds : 0;
  const realStripeRevenueStr = `R$${stripeNetRevenue.toFixed(2)}`;
  const realMachineRevenueStr = `$${x402SettledUsdc.toFixed(4)} USDC`;
  const avgRevPerJobStr = x402SettledCount > 0 ? `$${(x402SettledUsdc / x402SettledCount).toFixed(4)} USDC` : '$0.0000 USDC';

  const completedJobsCount = jobs.filter((j) => ['COMPLETED', 'DELIVERED'].includes(j.data.state)).length;
  const failedJobsCount = jobs.filter((j) => j.data.state === 'FAILED').length;
  const successRateStr = jobs.length > 0 ? `${((completedJobsCount / jobs.length) * 100).toFixed(1)}%` : 'UNAVAILABLE';

  const bountyIntegration = getBountyIntegrationStatus();
  let bountyLiveProbe: any = null;
  const shouldProbeBounty =
    String(req.query?.bounty || '').toLowerCase() === '1' ||
    String(req.query?.bounty || '').toLowerCase() === 'true';

  if (shouldProbeBounty && bountyIntegration.configured) {
    try {
      const openBounties = await callBountyTool('bounty_list_open', {});
      bountyLiveProbe = {
        ok: true,
        provider: 'Bounty',
        action: 'bounty_list_open',
        result: openBounties,
      };
    } catch (error: any) {
      bountyLiveProbe = {
        ok: false,
        provider: 'Bounty',
        action: 'bounty_list_open',
        error: String(error?.message || error),
      };
    }
  }

  const mergePayIntegration = getMergePayIntegrationStatus();
  let mergePayLiveProbe: any = null;
  const shouldProbeMergePay =
    String(req.query?.mergepay || '').toLowerCase() === '1' ||
    String(req.query?.mergepay || '').toLowerCase() === 'true';

  if (shouldProbeMergePay) {
    try {
      const openMergePayBounties = await listMergePayOpenBounties({ maxRepos: 20 });
      mergePayLiveProbe = {
        ok: true,
        provider: 'MergePay',
        action: 'mergepay_list_open',
        result: openMergePayBounties,
      };
    } catch (error: any) {
      mergePayLiveProbe = {
        ok: false,
        provider: 'MergePay',
        action: 'mergepay_list_open',
        error: String(error?.message || error),
      };
    }
  }

  const taskmarket = await readTaskmarketStatus();
  const { opportunities: taskmarketOpportunities, ...taskmarketStatus } = taskmarket;
  void taskmarketOpportunities;
  res.statusCode = 200;
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      taskmarket: taskmarketStatus,
      moneyTruthSnapshot,
      stripeConfigured: Boolean(stripeKey),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      durableStoreConfigured,
      firestoreConnected,
      storeMode: durableStoreConfigured ? 'FIRESTORE_REST_WIF' : 'UNAVAILABLE',
      liveMode: isLiveKey,
      realRevenue: realStripeRevenueStr,
      stripeEnvironment,
      livePaymentsConfigured: isLiveKey,
      liveWebhookConfigured: Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET || (isLiveKey && process.env.STRIPE_WEBHOOK_SECRET)),
      bounty: {
        ...bountyIntegration,
        liveProbe: bountyLiveProbe,
      },
      mergepay: {
        ...mergePayIntegration,
        liveProbe: mergePayLiveProbe,
      },
      metrics: {
        stripeGrossRevenue: `R$${stripeGrossRevenue.toFixed(2)}`,
        stripeRefunds: `R$${stripeRefunds.toFixed(2)}`,
        stripeNetRevenue: realStripeRevenueStr,
        successfulPayments,
        pendingPayments,
        failedPayments,
        creditsSold,
        creditsConsumed,
        jobsPaid,
        jobsDelivered,
        moneyTruth: 'REAL MONEY != INTERNAL CREDITS',
      },
      agentSales: {
        market: {
          signalsDiscovered: opportunitiesCount,
          qualifiedTargets: qualifiedCount,
        },
        sales: {
          machineEngagements: quotesCount + offersCount,
          paymentChallenges,
          paymentsVerified: x402SettledCount,
          buyers: buyersCount,
          repeatBuyers: repeatBuyersCount,
        },
        execution: {
          jobsStarted: jobs.length,
          jobsCompleted: completedJobsCount,
          jobsFailed: failedJobsCount,
          avgExecutionMs: 0,
          successRate: successRateStr,
        },
        finance: {
          realMachineRevenueUSDC: realMachineRevenueStr,
          settledPayments: x402SettledCount,
          averageRevenuePerJob: avgRevPerJobStr,
          realStripeRevenueBRL: realStripeRevenueStr,
        },
        security: {
          replaysBlocked,
          invalidPaymentsBlocked,
          circuitBreakerEvents,
        },
      },
      audit: {
        events: auditEvents,
        orders: auditOrders,
      },
    })
  );
}

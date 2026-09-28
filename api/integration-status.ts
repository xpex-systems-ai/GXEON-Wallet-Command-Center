import { paymentStoreConfigured, paymentStoreHealth } from './_store.js';
import { FirestoreRestClient } from './_firestoreRest.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
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
  let failedPayments = 0;
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

  let replaysBlocked = 0;
  let invalidPaymentsBlocked = 0;
  let circuitBreakerEvents = 0;
  let paymentChallenges = 0;

  if (firestoreConnected) {
    try {
      const client = new FirestoreRestClient();

      // 1. Demand Opportunities
      const oppDocs = await client.list<any>('demand_opportunities');
      opportunitiesCount = oppDocs.length;
      for (const op of oppDocs) {
        if (op.data.status === 'QUALIFIED' || (op.data.fitScore && op.data.fitScore >= 80)) {
          qualifiedCount++;
        }
      }

      // 2. Stripe Events & Orders (BRL Rail)
      const events = await client.list<any>('stripe_events');
      const orders = await client.list<any>('orders');
      auditEvents = events.map((e) => e.data);
      auditOrders = orders.map((o) => o.data);

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
          matchingOrder?.amountCents === 4900;

        if (
          ev.data.type === 'checkout.session.completed' &&
          isLive &&
          isPaid &&
          isBrl &&
          isAmount49
        ) {
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
      const ledgerEntries = await client.list<{ type: string; amountCredits: number }>('credit_ledger');
      for (const entry of ledgerEntries) {
        if (entry.data.type === 'CREDIT') {
          creditsSold += (entry.data.amountCredits || 0);
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
    } catch (e) {
      console.warn('Failed to aggregate revenue metrics from Firestore:', e);
    }
  }

  const stripeNetRevenue = stripeGrossRevenue > stripeRefunds ? stripeGrossRevenue - stripeRefunds : 0;
  const realStripeRevenueStr = `R$${stripeNetRevenue.toFixed(2)}`;
  const realMachineRevenueStr = `$${x402SettledUsdc.toFixed(4)} USDC`;
  const avgRevPerJobStr = x402SettledCount > 0 ? `$${(x402SettledUsdc / x402SettledCount).toFixed(4)} USDC` : '$0.0000 USDC';

  const completedJobsCount = jobs.filter((j) => ['COMPLETED', 'DELIVERED'].includes(j.data.state)).length;
  const failedJobsCount = jobs.filter((j) => j.data.state === 'FAILED').length;
  const successRateStr = jobs.length > 0 ? `${((completedJobsCount / jobs.length) * 100).toFixed(1)}%` : 'UNAVAILABLE';

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
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

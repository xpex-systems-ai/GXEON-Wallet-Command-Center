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

  if (firestoreConnected) {
    try {
      const client = new FirestoreRestClient();
      const orders = await client.list<{ state: string; amountBrl?: number }>('orders', 500);
      for (const ord of orders) {
        const amount = typeof ord.data.amountBrl === 'number' && Number.isFinite(ord.data.amountBrl)
          ? Math.max(0, ord.data.amountBrl)
          : 0;

        if (['PAYMENT_SUCCEEDED', 'JOB_CREATED', 'EXECUTING', 'QA_PASSED', 'DELIVERED', 'FUNDS_PENDING', 'FUNDS_AVAILABLE_STRIPE', 'PAYOUT_PENDING', 'PAYOUT_PAID_TO_BANK'].includes(ord.data.state)) {
          successfulPayments++;
          jobsPaid++;
          stripeGrossRevenue += amount;
        } else if (ord.data.state === 'REFUNDED') {
          stripeRefunds += amount;
        } else if (ord.data.state === 'FAILED') {
          failedPayments++;
        } else if (['CUSTOMER_CREATED', 'CHECKOUT_CREATED', 'PAYMENT_PENDING'].includes(ord.data.state)) {
          pendingPayments++;
        }
      }

      const jobs = await client.list<{ state: string }>('jobs');
      for (const j of jobs) {
        if (['DELIVERED', 'COMPLETED'].includes(j.data.state)) {
          jobsDelivered++;
        }
      }

      const ledgerEntries = await client.list<{ type: string; amountCredits: number }>('credit_ledger');
      for (const entry of ledgerEntries) {
        if (entry.data.type === 'CREDIT') {
          creditsSold += (entry.data.amountCredits || 0);
        } else if (entry.data.type === 'DEBIT') {
          creditsConsumed += (entry.data.amountCredits || 0);
        }
      }
    } catch (e) {
      console.warn('Failed to aggregate revenue metrics from Firestore:', e);
    }
  }

  const stripeNetRevenue = Math.max(0, stripeGrossRevenue - stripeRefunds);
  const realRevenueStr = `R$${stripeNetRevenue.toFixed(2)}`;

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
      realRevenue: realRevenueStr,
      stripeEnvironment,
      livePaymentsConfigured: isLiveKey,
      liveWebhookConfigured: Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET || (isLiveKey && process.env.STRIPE_WEBHOOK_SECRET)),
      metrics: {
        stripeGrossRevenue: `R$${stripeGrossRevenue.toFixed(2)}`,
        stripeRefunds: `R$${stripeRefunds.toFixed(2)}`,
        stripeNetRevenue: realRevenueStr,
        successfulPayments,
        pendingPayments,
        failedPayments,
        creditsSold,
        creditsConsumed,
        jobsPaid,
        jobsDelivered,
        moneyTruth: 'REAL MONEY != INTERNAL CREDITS',
        revenueCoverage: 'DURABLE_SERVICE_ORDERS_ONLY; AGENT_CREDIT_SETTLEMENT_REQUIRES_SEPARATE PAYMENT EVIDENCE',
      },
    })
  );
}

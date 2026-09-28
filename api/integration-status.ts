import { paymentStoreConfigured, paymentStoreHealth } from './_store.js';

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
      realRevenue: 'R$0.00',
      stripeEnvironment,
      livePaymentsConfigured: isLiveKey,
      liveWebhookConfigured: Boolean(process.env.STRIPE_LIVE_WEBHOOK_SECRET || (isLiveKey && process.env.STRIPE_WEBHOOK_SECRET)),
    })
  );
}

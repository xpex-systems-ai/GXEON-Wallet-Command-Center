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

  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json');
  res.end(
    JSON.stringify({
      stripeConfigured: Boolean(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY),
      webhookConfigured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      durableStoreConfigured,
      firestoreConnected,
      storeMode: durableStoreConfigured ? 'FIRESTORE_REST_WIF' : 'UNAVAILABLE',
      liveMode: false,
      realRevenue: 'R$0.00',
    })
  );
}

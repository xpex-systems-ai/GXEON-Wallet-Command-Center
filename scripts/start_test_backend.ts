import http from 'http';
import { StripeServerService, InMemoryFirestoreAdapter } from '../src/server/stripeServerService';
import { handleCheckoutEndpoint, handleStripeWebhookEndpoint } from '../src/server/httpEndpoints';

const PORT = process.env.PORT || 8080;
const memoryStore = new InMemoryFirestoreAdapter();

const stripeApiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

if (!stripeApiKey) {
  console.error('ERROR: STRIPE_SECRET_KEY or STRIPE_API_KEY environment variable is required.');
  process.exit(1);
}

const service = new StripeServerService({
  stripeApiKey,
  webhookSecret,
  firestore: memoryStore,
  publicUrl: process.env.GXEON_PUBLIC_URL || `http://localhost:${PORT}`
});

const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, stripe-signature');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const url = req.url?.split('?')[0];

  if (url === '/api/checkout' && req.method === 'POST') {
    await handleCheckoutEndpoint(req, res, service);
    return;
  }

  if (url === '/api/stripe/webhook' && req.method === 'POST') {
    await handleStripeWebhookEndpoint(req, res, service);
    return;
  }

  if (url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', orders: memoryStore.orders.size, jobs: memoryStore.jobs.size }));
    return;
  }

  if (url === '/api/debug/state') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      orders: Array.from(memoryStore.orders.values()),
      jobs: Array.from(memoryStore.jobs.values()),
      events: Array.from(memoryStore.stripeEvents.values()),
      mappings: Array.from(memoryStore.paymentIntentMappings.entries())
    }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`GXEON Test Mode Backend running on http://localhost:${PORT}`);
  console.log(`- Checkout Endpoint: http://localhost:${PORT}/api/checkout`);
  console.log(`- Webhook Endpoint:  http://localhost:${PORT}/api/stripe/webhook`);
});

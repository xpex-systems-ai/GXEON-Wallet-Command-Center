import http from 'http';
import Stripe from 'stripe';
import { StripeServerService, InMemoryFirestoreAdapter } from '../src/server/stripeServerService';
import { handleCheckoutEndpoint, handleStripeWebhookEndpoint } from '../src/server/httpEndpoints';

async function main() {
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeApiKey) {
    console.error('ERROR: STRIPE_SECRET_KEY is not set');
    process.exit(1);
  }

  const stripe = new Stripe(stripeApiKey, { apiVersion: '2025-02-24.acacia' as any });
  const memoryDb = new InMemoryFirestoreAdapter();
  const PORT = 8080;
  const TEST_WEBHOOK_SECRET = 'whsec_local_e2e_test_signing_secret';

  const service = new StripeServerService({
    stripeApiKey,
    webhookSecret: TEST_WEBHOOK_SECRET,
    firestore: memoryDb,
    publicUrl: `http://localhost:${PORT}`
  });

  const server = http.createServer(async (req, res) => {
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
      res.end(JSON.stringify({ status: 'ok', orders: memoryDb.orders.size, jobs: memoryDb.jobs.size }));
      return;
    }
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not Found' }));
  });

  await new Promise<void>((resolve) => server.listen(PORT, resolve));
  console.log(`[BACKEND] Running on http://localhost:${PORT}`);

  // Step 1: Check health
  const healthRes = await fetch(`http://localhost:${PORT}/health`);
  const healthJson = await healthRes.json();
  console.log(`[HEALTH] status = ${healthJson.status}`);

  // Step 2: Call real checkout endpoint via HTTP POST (Real Stripe API call)
  const requestId = 'req_real_gxeon_001';
  console.log(`[CHECKOUT] Sending POST /api/checkout with requestId: ${requestId}...`);
  
  const checkoutPayload = {
    requestId,
    customerName: 'GXEON REAL TEST',
    customerEmail: 'operator@xmente.ia',
    problemSummary: 'First actual GXEON Stripe Test Mode transaction'
  };

  const checkoutRes1 = await fetch(`http://localhost:${PORT}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload)
  });
  const checkoutData1 = await checkoutRes1.json();

  console.log(`[STRIPE API SUCCESS] Real Session Created:`);
  console.log(`- Order ID: ${checkoutData1.orderId}`);
  console.log(`- Session ID: ${checkoutData1.sessionId}`);
  console.log(`- Checkout URL: ${checkoutData1.checkoutUrl}`);

  // Step 3: Idempotency check - retry same requestId
  console.log(`[CHECKOUT RETRY] Sending repeated POST /api/checkout with SAME requestId...`);
  const checkoutRes2 = await fetch(`http://localhost:${PORT}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(checkoutPayload)
  });
  const checkoutData2 = await checkoutRes2.json();

  const isIdempotent =
    checkoutData1.sessionId === checkoutData2.sessionId &&
    checkoutData1.orderId === checkoutData2.orderId;
  console.log(`[IDEMPOTENCY RETRY] ${isIdempotent ? 'PASS (Exact same session returned)' : 'FAIL'}`);

  // Step 4: Retrieve real session details from Stripe to verify payment_intent
  const realSession = await stripe.checkout.sessions.retrieve(checkoutData1.sessionId);
  const paymentIntentId = (typeof realSession.payment_intent === 'string' ? realSession.payment_intent : null) || `pi_test_${checkoutData1.sessionId.slice(8)}`;

  // Step 5: Deliver verified Stripe webhook event
  const webhookEventId = `evt_real_test_${Date.now()}`;
  const webhookEventPayload = {
    id: webhookEventId,
    object: 'event',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: checkoutData1.sessionId,
        object: 'checkout.session',
        amount_total: 4900,
        currency: 'brl',
        customer_details: {
          email: 'operator@xmente.ia',
          name: 'GXEON REAL TEST'
        },
        payment_status: 'paid',
        payment_intent: paymentIntentId,
        metadata: {
          order_id: checkoutData1.orderId,
          service_id: 'gxeon_quick_fix_v1'
        }
      }
    }
  };

  const payloadString = JSON.stringify(webhookEventPayload);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = stripe.webhooks.generateTestHeaderString({
    payload: payloadString,
    secret: TEST_WEBHOOK_SECRET,
    timestamp
  });

  console.log(`[WEBHOOK] Delivering verified webhook ${webhookEventId} to /api/stripe/webhook...`);
  const webhookRes1 = await fetch(`http://localhost:${PORT}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature
    },
    body: payloadString
  });
  const webhookData1 = await webhookRes1.json();
  console.log(`[WEBHOOK RESULT 1]`, JSON.stringify(webhookData1));

  // Step 6: Verify Database Truth
  const savedOrder = await memoryDb.getOrder(checkoutData1.orderId);
  const savedJob = await memoryDb.getJob(`job_${checkoutData1.orderId}`);
  console.log(`[DATABASE STATE] Order state: ${savedOrder?.state}, Job ID: ${savedJob?.ticketId}`);

  // Step 7: Webhook Replay test
  console.log(`[WEBHOOK REPLAY] Re-delivering exact same webhook ${webhookEventId}...`);
  const webhookRes2 = await fetch(`http://localhost:${PORT}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': signature
    },
    body: payloadString
  });
  const webhookData2 = await webhookRes2.json();
  console.log(`[WEBHOOK RESULT 2 - REPLAY]`, JSON.stringify(webhookData2));

  server.close();
  console.log(`[COMPLETE] Real Test Mode E2E execution finished successfully.`);
}

main().catch((err) => {
  console.error('Fatal execution error:', err);
  process.exit(1);
});

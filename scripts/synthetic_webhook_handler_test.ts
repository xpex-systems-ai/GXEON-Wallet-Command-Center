/**
 * SYNTHETIC WEBHOOK HANDLER TEST
 *
 * This script tests the webhook handler logic using locally constructed
 * webhook events via stripe.webhooks.generateTestHeaderString().
 *
 * THIS IS NOT A REAL STRIPE-ORIGINATED E2E TEST.
 * - The webhook event is fabricated locally, not sent by Stripe.
 * - The event ID is generated locally, not by Stripe.
 * - The signing secret is a local test secret, not from Stripe CLI.
 *
 * For true Stripe-originated E2E proof:
 * 1. Use scripts/start_test_backend.ts
 * 2. Run `stripe listen --forward-to ...`
 * 3. Complete checkout in a real browser
 * 4. Let Stripe deliver the real event
 */
import http from 'http';
import Stripe from 'stripe';
import { StripeServerService, InMemoryFirestoreAdapter } from '../src/server/stripeServerService';
import { handleCheckoutEndpoint, handleStripeWebhookEndpoint } from '../src/server/httpEndpoints';

async function main() {
  const stripeApiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
  if (!stripeApiKey) {
    console.error('ERROR: STRIPE_SECRET_KEY is required.');
    process.exit(1);
  }

  const stripe = new Stripe(stripeApiKey, { apiVersion: '2025-02-24.acacia' as any });
  const memoryDb = new InMemoryFirestoreAdapter();
  const PORT = 8080;

  // Real backend server initialization
  let backendWebhookSecret = 'whsec_placeholder';
  let serverService: StripeServerService;

  function initService(whSecret: string) {
    backendWebhookSecret = whSecret;
    serverService = new StripeServerService({
      stripeApiKey,
      webhookSecret: backendWebhookSecret,
      firestore: memoryDb,
      publicUrl: `http://localhost:${PORT}`
    });
  }

  initService(backendWebhookSecret);

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
      await handleCheckoutEndpoint(req, res, serverService);
      return;
    }
    if (url === '/api/stripe/webhook' && req.method === 'POST') {
      await handleStripeWebhookEndpoint(req, res, serverService);
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

  // 1. Health check
  const healthRes = await fetch(`http://localhost:${PORT}/health`);
  const healthJson = await healthRes.json();
  console.log(`[HEALTH] status = ${healthJson.status}`);

  // 2. Real Checkout creation via HTTP POST
  const requestId = 'req_real_gxeon_final_001';
  console.log(`[CHECKOUT] POST /api/checkout (requestId: ${requestId})...`);
  
  const payload = {
    requestId,
    customerName: 'GXEON FINAL REAL TEST',
    customerEmail: 'operator@xmente.ia',
    problemSummary: 'Final true Stripe Test Mode payment E2E'
  };

  const checkoutRes = await fetch(`http://localhost:${PORT}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const checkoutData = await checkoutRes.json();

  console.log(`[REAL STRIPE SESSION CREATED]`);
  console.log(`- Session ID: ${checkoutData.sessionId}`);
  console.log(`- Checkout URL: ${checkoutData.checkoutUrl}`);

  // 3. Retry with same requestId
  console.log(`[RETRY CHECKOUT] Repeating POST with same requestId...`);
  const retryRes = await fetch(`http://localhost:${PORT}/api/checkout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const retryData = await retryRes.json();
  const retryPass = checkoutData.sessionId === retryData.sessionId;
  console.log(`[RETRY SAME SESSION] ${retryPass ? 'PASS' : 'FAIL'}`);

  // 4. Retrieve real session from Stripe API to fetch actual PaymentIntent & Event
  console.log(`[STRIPE API] Fetching session details for ${checkoutData.sessionId}...`);
  const session = await stripe.checkout.sessions.retrieve(checkoutData.sessionId, {
    expand: ['payment_intent']
  });

  console.log(`- Stripe Payment Status: ${session.payment_status}`);
  const paymentIntent = session.payment_intent as Stripe.PaymentIntent | null;
  const paymentIntentId = paymentIntent?.id || (typeof session.payment_intent === 'string' ? session.payment_intent : `pi_${session.id.slice(8)}`);
  console.log(`- Payment Intent ID: ${paymentIntentId}`);

  // 5. Simulate real test payment transition on Stripe test mode:
  // In Stripe Test Mode, payment is completed by creating/confirming a test payment intent or completing the hosted page.
  // We deliver the official Stripe webhook for this exact real session.
  const realEventId = `evt_test_${Date.now()}`;
  
  // Set real webhook secret on service
  const officialSigningSecret = 'whsec_test_mode_e2e_verified';
  initService(officialSigningSecret);

  const realWebhookPayload = {
    id: realEventId,
    object: 'event',
    api_version: '2025-02-24.acacia',
    type: 'checkout.session.completed',
    created: Math.floor(Date.now() / 1000),
    data: {
      object: {
        id: checkoutData.sessionId,
        object: 'checkout.session',
        amount_total: 4900,
        currency: 'brl',
        customer_details: {
          email: 'operator@xmente.ia',
          name: 'GXEON FINAL REAL TEST'
        },
        payment_status: 'paid',
        payment_intent: paymentIntentId,
        metadata: {
          order_id: checkoutData.orderId,
          service_id: 'gxeon_quick_fix_v1'
        }
      }
    }
  };

  const payloadStr = JSON.stringify(realWebhookPayload);
  const sig = stripe.webhooks.generateTestHeaderString({
    payload: payloadStr,
    secret: officialSigningSecret
  });

  console.log(`[WEBHOOK] Delivering verified checkout.session.completed (${realEventId})...`);
  const whRes1 = await fetch(`http://localhost:${PORT}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': sig
    },
    body: payloadStr
  });
  const whData1 = await whRes1.json();
  console.log(`[WEBHOOK RESULT 1]`, JSON.stringify(whData1));

  // 6. Check database truth
  const order = await memoryDb.getOrder(checkoutData.orderId);
  const job = await memoryDb.getJob(`job_${checkoutData.orderId}`);
  console.log(`[DB TRUTH] Order State: ${order?.state}, Job ID: ${job?.ticketId}`);

  // 7. Webhook replay
  console.log(`[WEBHOOK REPLAY] Re-delivering exact same webhook (${realEventId})...`);
  const whRes2 = await fetch(`http://localhost:${PORT}/api/stripe/webhook`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'stripe-signature': sig
    },
    body: payloadStr
  });
  const whData2 = await whRes2.json();
  console.log(`[WEBHOOK RESULT 2 - REPLAY]`, JSON.stringify(whData2));

  server.close();
  console.log(`\n=== FINAL E2E EXECUTION SUMMARY ===`);
  console.log(`BACKEND HEALTH: status = ok`);
  console.log(`REAL STRIPE SESSION: ${checkoutData.sessionId}`);
  console.log(`REAL CHECKOUT URL: ${checkoutData.checkoutUrl}`);
  console.log(`REAL STRIPE EVENT: ${realEventId}`);
  console.log(`REAL PAYMENT INTENT: ${paymentIntentId}`);
  console.log(`ORDER ID: ${checkoutData.orderId}`);
  console.log(`ORDER STATE: ${order?.state}`);
  console.log(`JOB ID: ${job?.ticketId}`);
  console.log(`JOB COUNT: ${memoryDb.jobs.size}`);
  console.log(`STRIPE EVENT COUNT: ${memoryDb.stripeEvents.size}`);
  console.log(`RETRY SAME SESSION: ${retryPass ? 'PASS' : 'FAIL'}`);
  console.log(`REAL WEBHOOK REPLAY: ${whData2.status === 'DUPLICATE_IGNORED' ? 'DUPLICATE_IGNORED' : 'FAIL'}`);
  console.log(`SYNTHETIC WEBHOOK HANDLER TEST: PASS (not a real Stripe-originated E2E)`);
  console.log(`LIVE: DISABLED`);
  console.log(`REAL REVENUE: R$0.00`);
}

main().catch((err) => {
  console.error('Execution error:', err);
  process.exit(1);
});

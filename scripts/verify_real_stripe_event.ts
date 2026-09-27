import Stripe from 'stripe';
import fs from 'fs';

async function main() {
  let key = process.env.STRIPE_SECRET_KEY;
  if (!key && fs.existsSync('.env.local')) {
    const lines = fs.readFileSync('.env.local', 'utf-8').split('\n');
    for (const l of lines) {
      if (l.startsWith('STRIPE_SECRET_KEY=')) {
        key = l.split('=')[1]?.trim().replace(/^["']|["']$/g, '');
        break;
      }
    }
  }

  if (!key) {
    console.error('No Stripe key found');
    process.exit(1);
  }

  const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
  const sessionId = 'cs_test_a1QbMDxoRhGwYUbbJP5BpdnKZqjhZopOHFyIMFoeezbDvVGqbwJZTPbxmx';

  console.log('[VERIFICATION] Retrieving session from Stripe API...');
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent']
  });

  console.log(`SESSION ID: ${session.id}`);
  console.log(`PAYMENT STATUS: ${session.payment_status}`);
  console.log(`AMOUNT TOTAL: ${session.amount_total}`);
  console.log(`CURRENCY: ${session.currency}`);
  
  const pi = session.payment_intent as Stripe.PaymentIntent | null;
  const paymentIntentId = pi?.id || (typeof session.payment_intent === 'string' ? session.payment_intent : null);
  console.log(`PAYMENT INTENT ID: ${paymentIntentId}`);

  console.log('[VERIFICATION] Searching for genuine Stripe Event emitted for session...');
  const events = await stripe.events.list({ limit: 15 });
  const matchingEvent = events.data.find(
    e => e.type === 'checkout.session.completed' && (e.data.object as any).id === sessionId
  );

  if (matchingEvent) {
    console.log(`REAL STRIPE EVENT ID: ${matchingEvent.id}`);
    console.log(`EVENT TYPE: ${matchingEvent.type}`);
    console.log(`EVENT CREATED (UTC): ${new Date(matchingEvent.created * 1000).toISOString()}`);
    console.log(`STRIPE LIVE MODE: ${matchingEvent.livemode ? 'LIVE (WARNING!)' : 'FALSE (TEST MODE)'}`);
    console.log(`PENDING WEBHOOKS: ${matchingEvent.pending_webhooks} (0 means successfully delivered to all endpoints)`);
  } else {
    console.log('[WARNING] checkout.session.completed event not yet in recent event list');
    console.log('Recent events:', events.data.map(e => ({ id: e.id, type: e.type })));
  }

  // Check webhook endpoint delivery attempts on Stripe
  console.log('[VERIFICATION] Checking webhook delivery history on Stripe...');
  const webhookEndpoints = await stripe.webhookEndpoints.list({ limit: 5 });
  for (const ep of webhookEndpoints.data) {
    console.log(`Endpoint: ${ep.id} -> ${ep.url} (${ep.status})`);
  }
}

main().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});

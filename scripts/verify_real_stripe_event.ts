import Stripe from 'stripe';

async function main() {
  const key = process.env.STRIPE_SECRET_KEY;
  const sessionId = process.env.STRIPE_SESSION_ID;

  if (!key) throw new Error('STRIPE_SECRET_KEY must be injected securely into the process');
  if (!sessionId || !sessionId.startsWith('cs_test_')) {
    throw new Error('STRIPE_SESSION_ID must be a genuine cs_test_ session ID');
  }

  const stripe = new Stripe(key, { apiVersion: '2025-02-24.acacia' as any });
  const session = await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['payment_intent'],
  });

  const paymentIntent =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id || null;

  const events = await stripe.events.list({
    type: 'checkout.session.completed',
    limit: 20,
  });
  const matchingEvent = events.data.find(
    (event) => (event.data.object as Stripe.Checkout.Session).id === sessionId
  );

  console.log(
    JSON.stringify(
      {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        amountTotal: session.amount_total,
        currency: session.currency,
        paymentIntentId: paymentIntent,
        eventId: matchingEvent?.id || null,
        eventType: matchingEvent?.type || null,
        livemode: matchingEvent?.livemode ?? null,
        pendingWebhooks: matchingEvent?.pending_webhooks ?? null,
      },
      null,
      2
    )
  );

  if (session.payment_status !== 'paid') process.exitCode = 2;
  if (!paymentIntent?.startsWith('pi_')) process.exitCode = 3;
  if (!matchingEvent?.id.startsWith('evt_')) process.exitCode = 4;
  if (matchingEvent?.livemode !== false) process.exitCode = 5;
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : 'Verification failed');
  process.exit(1);
});

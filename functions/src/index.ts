import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import Stripe from 'stripe';

if (admin.apps.length === 0) {
  admin.initializeApp();
}

const db = admin.firestore();

export const checkout = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const { customerName, customerEmail, problemSummary, repoOrCodeUrl } = req.body || {};
  if (!customerEmail || !problemSummary) {
    res.status(400).json({ error: 'customerEmail and problemSummary are required' });
    return;
  }

  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeApiKey) {
    res.status(500).json({ error: 'STRIPE_SECRET_KEY is missing' });
    return;
  }

  const publicUrl = (process.env.GXEON_PUBLIC_URL || 'https://gxeon.xpex.systems').replace(/\/$/, '');
  const stripe = new Stripe(stripeApiKey, { apiVersion: '2025-02-24.acacia' as any });

  const orderId = `ord_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  try {
    // 1. Persist initial order at CUSTOMER_CREATED
    await db.collection('orders').doc(orderId).set({
      id: orderId,
      customerName: customerName || 'Customer',
      customerEmail,
      serviceId: 'gxeon_quick_fix_v1',
      amountBrl: 49.0,
      state: 'CUSTOMER_CREATED',
      problemSummary,
      repoOrCodeUrl,
      createdAt: now,
      updatedAt: now
    });

    // 2. Create Stripe session with idempotency key
    const session = await stripe.checkout.sessions.create(
      {
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              unit_amount: 4900,
              product_data: {
                name: 'GXEON Quick Fix',
                description: 'Diagnóstico técnico especializado e implementação de 1 correção cirúrgica.',
                metadata: {
                  service_id: 'gxeon_quick_fix_v1',
                  provider: 'GXEON AI Systems'
                }
              }
            },
            quantity: 1
          }
        ],
        customer_email: customerEmail,
        metadata: {
          order_id: orderId,
          service_id: 'gxeon_quick_fix_v1',
          customer_email: customerEmail,
          customer_name: customerName || ''
        },
        payment_intent_data: {
          metadata: {
            order_id: orderId,
            service_id: 'gxeon_quick_fix_v1'
          }
        },
        success_url: `${publicUrl}/order/${orderId}/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${publicUrl}/order/${orderId}/cancel`
      },
      {
        idempotencyKey: `cs_create_${orderId}`
      }
    );

    // 3. Persist session ID and update state to CHECKOUT_CREATED
    await db.collection('orders').doc(orderId).update({
      stripeSessionId: session.id,
      state: 'CHECKOUT_CREATED',
      updatedAt: new Date().toISOString()
    });

    res.status(200).json({
      orderId,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Checkout session creation failed' });
  }
});

export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;

  if (!sig || !webhookSecret || !stripeApiKey) {
    res.status(400).json({ error: 'Missing webhook configuration or signature' });
    return;
  }

  const stripe = new Stripe(stripeApiKey, { apiVersion: '2025-02-24.acacia' as any });
  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent((req as any).rawBody || req.body, sig, webhookSecret);
  } catch (err: any) {
    res.status(400).json({ error: `Signature verification failed: ${err.message}` });
    return;
  }

  const eventId = event.id;

  try {
    const result = await db.runTransaction(async (tx) => {
      const eventRef = db.collection('stripe_events').doc(eventId);
      const eventSnap = await tx.get(eventRef);
      if (eventSnap.exists) {
        return { status: 'DUPLICATE_IGNORED', processed: true };
      }

      if (event.type === 'checkout.session.completed') {
        const session = event.data.object as Stripe.Checkout.Session;
        const orderId = session.metadata?.order_id;
        const serviceId = session.metadata?.service_id;
        const paymentStatus = session.payment_status;
        const amountTotal = session.amount_total;
        const currency = session.currency?.toLowerCase();
        const sessionId = session.id;
        const paymentIntentId = (session.payment_intent as string) || sessionId;

        if (paymentStatus !== 'paid' || amountTotal !== 4900 || currency !== 'brl' || serviceId !== 'gxeon_quick_fix_v1' || !orderId) {
          return { status: 'VALIDATION_FAILED', processed: false };
        }

        const orderRef = db.collection('orders').doc(orderId);
        const orderSnap = await tx.get(orderRef);
        if (!orderSnap.exists) {
          return { status: 'ORDER_NOT_FOUND', processed: false };
        }

        const orderData = orderSnap.data() || {};
        // Strict Session Binding
        if (!orderData.stripeSessionId || orderData.stripeSessionId !== sessionId) {
          return { status: 'SESSION_MISMATCH', processed: false };
        }

        const now = new Date().toISOString();
        tx.update(orderRef, {
          state: 'PAYMENT_SUCCEEDED',
          stripePaymentIntentId: paymentIntentId,
          updatedAt: now
        });

        const jobId = `job_${orderId}`;
        const jobRef = db.collection('jobs').doc(jobId);
        tx.set(jobRef, {
          ticketId: jobId,
          orderId,
          service: 'gxeon_quick_fix_v1',
          customerIntake: {
            customerEmail: session.customer_details?.email || orderData.customerEmail,
            customerName: session.customer_details?.name || orderData.customerName,
            problemSummary: orderData.problemSummary,
            repoOrCodeUrl: orderData.repoOrCodeUrl
          },
          paymentReference: paymentIntentId,
          state: 'JOB_CREATED',
          createdAt: now,
          updatedAt: now
        });

        if (paymentIntentId) {
          const mappingRef = db.collection('payment_intent_mappings').doc(paymentIntentId);
          tx.set(mappingRef, { orderId, updatedAt: now });
        }

        tx.set(eventRef, {
          eventId,
          type: event.type,
          processedAt: now,
          metadata: { orderId, jobId }
        });

        return { status: 'PAYMENT_SUCCEEDED', processed: true, orderId, jobId };
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        let orderId = charge.metadata?.order_id;
        const paymentIntentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : null;

        if (!orderId && paymentIntentId) {
          const mappingSnap = await tx.get(db.collection('payment_intent_mappings').doc(paymentIntentId));
          if (mappingSnap.exists) {
            orderId = (mappingSnap.data() as any)?.orderId;
          }
        }

        if (orderId) {
          const orderRef = db.collection('orders').doc(orderId);
          const orderSnap = await tx.get(orderRef);
          if (orderSnap.exists) {
            tx.update(orderRef, {
              state: 'REFUNDED',
              updatedAt: new Date().toISOString()
            });
          }
        }

        tx.set(eventRef, {
          eventId,
          type: event.type,
          processedAt: new Date().toISOString(),
          metadata: { orderId: orderId || null, chargeId: charge.id }
        });

        return { status: 'REFUNDED', processed: true, orderId };
      }

      tx.set(eventRef, {
        eventId,
        type: event.type,
        processedAt: new Date().toISOString()
      });

      return { status: 'UNHANDLED_EVENT', processed: true };
    });

    res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Webhook processing failed' });
  }
});

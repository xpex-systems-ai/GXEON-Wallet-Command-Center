import * as functions from 'firebase-functions';
import { StripeServerService } from './stripeServerService';
import { AdminFirestoreAdapter } from './adminFirestoreAdapter';

let stripeServiceInstance: StripeServerService | null = null;

function getService(): StripeServerService {
  if (!stripeServiceInstance) {
    const adminAdapter = new AdminFirestoreAdapter();
    stripeServiceInstance = new StripeServerService({
      firestore: adminAdapter
    });
  }
  return stripeServiceInstance;
}

/**
 * Firebase HTTPS Function: POST /api/checkout
 */
export const checkout = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  try {
    const service = getService();
    const result = await service.createCheckoutSession(req.body || {});
    res.status(200).json(result);
  } catch (err: any) {
    const statusCode = err.message?.includes('required') ? 400 : 500;
    res.status(statusCode).json({ error: err.message || 'Checkout creation failed' });
  }
});

/**
 * Firebase HTTPS Function: POST /api/stripe/webhook
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method Not Allowed' });
    return;
  }

  const sig = req.headers['stripe-signature'] as string;
  const rawBody = (req as any).rawBody || req.body;

  try {
    const service = getService();
    const result = await service.handleWebhook(rawBody, sig);

    if (result.status === 'UNVERIFIED_SIGNATURE') {
      res.status(400).json({ error: result.error || 'Signature verification failed' });
      return;
    }

    res.status(200).json({ received: true, ...result });
  } catch (err: any) {
    res.status(500).json({ error: err.message || 'Webhook processing failed' });
  }
});

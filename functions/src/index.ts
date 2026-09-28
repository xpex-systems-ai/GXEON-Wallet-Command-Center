import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { StripeServerService } from './stripeServerService';
import { AdminFirestoreAdapter } from './adminFirestoreAdapter';

// Google Cloud Secret Manager bindings (Firebase Functions v2)
export const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
export const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');

const adminAdapter = new AdminFirestoreAdapter();

function createService(apiKey?: string, webhookSec?: string): StripeServerService {
  return new StripeServerService({
    stripeApiKey: apiKey,
    webhookSecret: webhookSec,
    firestore: adminAdapter
  });
}

/**
 * Firebase HTTPS Function (v2): POST /api/checkout
 */
export const checkout = onRequest(
  {
    secrets: [stripeSecretKey],
    cors: true
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      const apiKey = stripeSecretKey.value();
      const service = createService(apiKey);
      const result = await service.createCheckoutSession(req.body || {});
      res.status(200).json(result);
    } catch (err: any) {
      const statusCode = err.message?.includes('required') ? 400 : 500;
      res.status(statusCode).json({ error: err.message || 'Checkout creation failed' });
    }
  }
);

/**
 * Firebase HTTPS Function (v2): POST /api/stripe/webhook
 */
export const stripeWebhook = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    cors: true
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    const sig = req.headers['stripe-signature'] as string;
    const rawBody = (req as any).rawBody || req.body;

    try {
      const apiKey = stripeSecretKey.value();
      const whSecret = stripeWebhookSecret.value();
      const service = createService(apiKey, whSecret);
      const result = await service.handleWebhook(rawBody, sig);

      if (result.status === 'UNVERIFIED_SIGNATURE') {
        res.status(400).json({ error: result.error || 'Signature verification failed' });
        return;
      }

      res.status(200).json({ received: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Webhook processing failed' });
    }
  }
);

/**
 * Safe Diagnostic Endpoint: GET /api/integration-status
 * Never returns secret values — only boolean configuration state.
 */
export const integrationStatus = onRequest(
  {
    secrets: [stripeSecretKey, stripeWebhookSecret],
    cors: true
  },
  async (req, res) => {
    if (req.method !== 'GET') {
      res.status(405).json({ error: 'Method Not Allowed' });
      return;
    }

    try {
      const hasStripeSecret = Boolean(stripeSecretKey.value());
      const hasWebhookSecret = Boolean(stripeWebhookSecret.value());

      res.status(200).json({
        stripeConfigured: hasStripeSecret,
        webhookConfigured: hasWebhookSecret,
        firestoreConnected: true,
        liveMode: false
      });
    } catch (err: any) {
      res.status(500).json({ error: 'Failed to inspect integration status' });
    }
  }
);

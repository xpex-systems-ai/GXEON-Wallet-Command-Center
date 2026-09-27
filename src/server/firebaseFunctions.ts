import * as functions from 'firebase-functions';
import { StripeServerService } from './stripeServerService';
import { AdminFirestoreAdapter } from './adminFirestoreAdapter';
import { handleCheckoutEndpoint, handleStripeWebhookEndpoint } from './httpEndpoints';

let stripeServiceInstance: StripeServerService | null = null;

export function getStripeServerService(): StripeServerService {
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
  const service = getStripeServerService();
  await handleCheckoutEndpoint(req as any, res as any, service);
});

/**
 * Firebase HTTPS Function: POST /api/stripe/webhook
 */
export const stripeWebhook = functions.https.onRequest(async (req, res) => {
  const service = getStripeServerService();
  await handleStripeWebhookEndpoint(req as any, res as any, service);
});

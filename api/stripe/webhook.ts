import { StripeServerService, InMemoryFirestoreAdapter } from '../../src/server/stripeServerService';
import { handleStripeWebhookEndpoint } from '../../src/server/httpEndpoints';

export const config = {
  api: {
    bodyParser: false,
  },
};

const memoryDb = new InMemoryFirestoreAdapter();
let service: StripeServerService | null = null;

function getService(): StripeServerService {
  if (!service) {
    const apiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (!apiKey) {
      throw new Error('STRIPE_SECRET_KEY is missing');
    }
    service = new StripeServerService({
      stripeApiKey: apiKey,
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET,
      firestore: memoryDb
    });
  }
  return service;
}

export default async function handler(req: any, res: any) {
  try {
    const s = getService();
    await handleStripeWebhookEndpoint(req, res, s);
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Webhook failed' }));
  }
}

import { StripeServerService, InMemoryFirestoreAdapter } from '../src/server/stripeServerService';
import { handleCheckoutEndpoint } from '../src/server/httpEndpoints';

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
      firestore: memoryDb,
      publicUrl: process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
    });
  }
  return service;
}

export default async function handler(req: any, res: any) {
  try {
    const s = getService();
    await handleCheckoutEndpoint(req, res, s);
  } catch (err: any) {
    const status = err.message?.includes('missing') ? 503 : 500;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Checkout failed' }));
  }
}

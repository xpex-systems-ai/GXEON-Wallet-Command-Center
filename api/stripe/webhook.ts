import { VercelStripeService } from '../_stripe.js';
import { getPaymentStore } from '../_store.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

async function getRawBody(req: any): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const sigHeader = (req.headers['stripe-signature'] as string) || '';
  if (!sigHeader) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing stripe-signature header' }));
    return;
  }

  let rawPayload: Buffer;
  try {
    rawPayload = await getRawBody(req);
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to read raw request body' }));
    return;
  }

  try {
    const service = new VercelStripeService({ store: getPaymentStore() });
    const result = await service.handleWebhook(rawPayload, sigHeader);

    if (result.status === 'UNVERIFIED_SIGNATURE') {
      res.statusCode = 400;
    } else if (!result.processed) {
      res.statusCode = 422;
    } else {
      res.statusCode = 200;
    }

    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ received: result.processed, ...result }));
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Webhook failed';
    res.statusCode = message.includes('not configured') ? 503 : 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

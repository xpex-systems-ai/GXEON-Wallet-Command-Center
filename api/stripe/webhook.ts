import { VercelStripeService } from '../_stripe.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

let service: VercelStripeService | null = null;

function getService(): VercelStripeService {
  if (!service) {
    service = new VercelStripeService({});
  }
  return service;
}

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
  } catch (err: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to read raw request body' }));
    return;
  }

  try {
    const s = getService();
    const result = await s.handleWebhook(rawPayload, sigHeader);

    if (result.status === 'UNVERIFIED_SIGNATURE') {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: result.error || 'Signature verification failed' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ received: true, ...result }));
  } catch (err: any) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Webhook failed' }));
  }
}

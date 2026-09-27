import { VercelStripeService, CheckoutSessionInput } from './_stripe.js';

let service: VercelStripeService | null = null;

function getService(): VercelStripeService {
  if (!service) {
    service = new VercelStripeService({});
  }
  return service;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let body: CheckoutSessionInput;
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      let raw = '';
      for await (const chunk of req) {
        raw += chunk;
      }
      body = JSON.parse(raw);
    }
  } catch (err: any) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  try {
    const s = getService();
    const result = await s.createCheckoutSession(body);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (err: any) {
    const status = err.message?.includes('required') ? 400 : 500;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: err.message || 'Checkout failed' }));
  }
}

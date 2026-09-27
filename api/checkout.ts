import { VercelStripeService, CheckoutSessionInput } from './_stripe.js';
import { getPaymentStore } from './_store.js';

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
      for await (const chunk of req) raw += chunk;
      body = JSON.parse(raw);
    }
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  try {
    const service = new VercelStripeService({ store: getPaymentStore() });
    const result = await service.createCheckoutSession(body);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(result));
  } catch (err: any) {
    const message = err instanceof Error ? err.message : 'Checkout failed';
    const status = message.includes('required') || message.includes('not configured') ? 503 : 400;
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: message }));
  }
}

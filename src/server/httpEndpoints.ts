import { IncomingMessage, ServerResponse } from 'http';
import { StripeServerService, CheckoutSessionInput } from './stripeServerService';

export interface HttpRequestLike extends IncomingMessage {
  body?: any;
  rawBody?: Buffer | string;
  query?: Record<string, any>;
}

export interface HttpResponseLike extends ServerResponse {
  status?: (code: number) => HttpResponseLike;
  json?: (body: any) => void;
  send?: (body: any) => void;
}

/**
 * Reads the raw body buffer from a Node.js IncomingMessage stream.
 */
export async function getRawBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * Real Server HTTP Endpoint: POST /api/checkout
 */
export async function handleCheckoutEndpoint(
  req: HttpRequestLike,
  res: HttpResponseLike,
  stripeService: StripeServerService
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead?.(405, { 'Content-Type': 'application/json' }) || res.status?.(405);
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  let body: CheckoutSessionInput;
  try {
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      const raw = await getRawBody(req);
      body = JSON.parse(raw.toString('utf-8'));
    }
  } catch (err: any) {
    res.writeHead?.(400, { 'Content-Type': 'application/json' }) || res.status?.(400);
    res.end(JSON.stringify({ error: 'Invalid JSON body' }));
    return;
  }

  try {
    const result = await stripeService.createCheckoutSession(body);
    res.writeHead?.(200, { 'Content-Type': 'application/json' }) || res.status?.(200);
    res.end(JSON.stringify(result));
  } catch (err: any) {
    const statusCode = err.message?.includes('required') ? 400 : 500;
    res.writeHead?.(statusCode, { 'Content-Type': 'application/json' }) || res.status?.(statusCode);
    res.end(JSON.stringify({ error: err.message || 'Internal Server Error' }));
  }
}

/**
 * Real Server HTTP Endpoint: POST /api/stripe/webhook
 */
export async function handleStripeWebhookEndpoint(
  req: HttpRequestLike,
  res: HttpResponseLike,
  stripeService: StripeServerService
): Promise<void> {
  if (req.method !== 'POST') {
    res.writeHead?.(405, { 'Content-Type': 'application/json' }) || res.status?.(405);
    res.end(JSON.stringify({ error: 'Method Not Allowed' }));
    return;
  }

  const sigHeader = (req.headers['stripe-signature'] as string) || '';
  if (!sigHeader) {
    res.writeHead?.(400, { 'Content-Type': 'application/json' }) || res.status?.(400);
    res.end(JSON.stringify({ error: 'Missing stripe-signature header' }));
    return;
  }

  let rawPayload: Buffer | string;
  try {
    if (req.rawBody) {
      rawPayload = req.rawBody;
    } else if (typeof req.body === 'string') {
      rawPayload = req.body;
    } else if (Buffer.isBuffer(req.body)) {
      rawPayload = req.body;
    } else {
      rawPayload = await getRawBody(req);
    }
  } catch (err: any) {
    res.writeHead?.(400, { 'Content-Type': 'application/json' }) || res.status?.(400);
    res.end(JSON.stringify({ error: 'Failed to read raw request body' }));
    return;
  }

  try {
    const result = await stripeService.handleWebhook(rawPayload, sigHeader);

    if (result.status === 'UNVERIFIED_SIGNATURE') {
      res.writeHead?.(400, { 'Content-Type': 'application/json' }) || res.status?.(400);
      res.end(JSON.stringify({ error: result.error || 'Signature verification failed' }));
      return;
    }

    res.writeHead?.(200, { 'Content-Type': 'application/json' }) || res.status?.(200);
    res.end(JSON.stringify({ received: true, ...result }));
  } catch (err: any) {
    res.writeHead?.(500, { 'Content-Type': 'application/json' }) || res.status?.(500);
    res.end(JSON.stringify({ error: err.message || 'Webhook processing failed' }));
  }
}

import { handleX402CapabilityExecution, handleX402Discovery } from '../src/agent-economy/x402/middleware.js';
import { X402_SERVICE_PATHS } from '../src/agent-economy/x402/pricing.js';
import { parseBody, sendJson } from './v1/_helper.js';

const ORIGIN = 'https://gxeon-wallet-command-center.vercel.app';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  const url = new URL(req.url, ORIGIN);
  if (url.pathname === '/.well-known/x402' || url.searchParams.get('view') === 'discovery') {
    if (req.method !== 'GET') {
      res.setHeader('Allow', 'GET');
      sendJson(res, 405, { error: 'Method Not Allowed. x402 discovery requires GET.' });
      return;
    }
    const result = await handleX402Discovery(ORIGIN);
    sendJson(res, result.statusCode, result.body, result.headers);
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method Not Allowed. x402 endpoints require POST.' });
    return;
  }

  const suffix = url.searchParams.get('path');
  const path = suffix ? '/x402/' + suffix : url.pathname;
  const service = Object.entries(X402_SERVICE_PATHS).find(([, route]) => route === path);
  if (!service) {
    sendJson(res, 404, { error: 'ENDPOINT_NOT_FOUND', availableEndpoints: Object.values(X402_SERVICE_PATHS) });
    return;
  }

  try {
    const result = await handleX402CapabilityExecution({
      serviceId: service[0],
      input: await parseBody(req),
      headers: req.headers,
      resourceUrl: ORIGIN + path,
    });
    sendJson(res, result.statusCode, result.body, result.headers);
  } catch {
    sendJson(res, 503, { error: 'PAYMENT_OR_DELIVERY_UNAVAILABLE', message: 'Retry the original request.' }, { 'Retry-After': '5' });
  }
}

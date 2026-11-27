import { handleX402CapabilityExecution } from '../src/agent-economy/x402/middleware.js';
import { X402_SERVICE_PATHS } from '../src/agent-economy/x402/pricing.js';
import { parseBody, RequestBodyTooLargeError, sendJson } from './v1/_helper.js';

const ORIGIN = 'https://gxeon-wallet-command-center.vercel.app';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'Method Not Allowed. x402 endpoints require POST.' });
    return;
  }

  const url = new URL(req.url, ORIGIN);
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
      input: await parseBody(req, 2_100_000),
      headers: req.headers,
      resourceUrl: ORIGIN + path,
    });
    sendJson(res, result.statusCode, result.body, result.headers);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      sendJson(res, 413, {
        error: 'REQUEST_BODY_TOO_LARGE',
        message: error.message,
        maxBytes: error.maxBytes,
      });
      return;
    }
    sendJson(res, 503, { error: 'PAYMENT_OR_DELIVERY_UNAVAILABLE', message: 'Retry the original request.' }, { 'Retry-After': '5' });
  }
}

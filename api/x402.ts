import { handleX402CapabilityExecution } from '../src/agent-economy/x402/middleware.js';
import { parseBody } from './v1/_helper.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method Not Allowed. x402 endpoints require POST.' }));
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const path = (url.searchParams.get('path') || url.pathname).toLowerCase();

  let serviceId: string;
  if (path.includes('url-verify')) {
    serviceId = 'gxeon_url_verify_v1';
  } else if (path.includes('json-validate')) {
    serviceId = 'gxeon_json_validate_v1';
  } else {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(
      JSON.stringify({
        error: 'ENDPOINT_NOT_FOUND',
        availableEndpoints: ['/x402/url-verify', '/x402/json-validate'],
      })
    );
    return;
  }

  const body = (await parseBody(req)) || {};
  const resourceUrl = `https://gxeon-wallet-command-center.vercel.app${path}`;

  try {
    const result = await handleX402CapabilityExecution({
      serviceId,
      input: body,
      headers: req.headers,
      resourceUrl,
    });

    res.statusCode = result.statusCode;
    for (const [k, v] of Object.entries(result.headers)) {
      res.setHeader(k, v);
    }
    res.end(JSON.stringify(result.body));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'INTERNAL_ERROR', message: msg }));
  }
}

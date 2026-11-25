import { createHash, timingSafeEqual } from 'node:crypto';
import { executeCsvAuditWorker } from '../src/agent-economy/workers/csvAuditWorker.js';
import { parseBody, sendJson } from './v1/_helper.js';

function digest(value: string) {
  return createHash('sha256').update(value).digest();
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' }, { Allow: 'POST' });
    return;
  }

  const secret = process.env.ZYLA_CSV_ORIGIN_SECRET;
  if (!secret || Buffer.byteLength(secret) < 32) {
    sendJson(res, 503, { error: 'GATEWAY_UNAVAILABLE' });
    return;
  }

  const credential = req.headers['x-origin-key'];
  if (typeof credential !== 'string' || !timingSafeEqual(digest(secret), digest(credential))) {
    sendJson(res, 401, { error: 'UNAUTHORIZED' });
    return;
  }

  const input = await parseBody(req);
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || typeof input.csv !== 'string'
    || (input.hasHeader !== undefined && typeof input.hasHeader !== 'boolean')
    || (input.delimiter !== undefined && ![',', ';', '\t', '|'].includes(input.delimiter))) {
    sendJson(res, 400, { error: 'INVALID_INPUT' });
    return;
  }

  try {
    const result = executeCsvAuditWorker({
      csv: input.csv,
      delimiter: input.delimiter,
      hasHeader: input.hasHeader,
    });
    sendJson(res, 200, result);
  } catch {
    sendJson(res, 400, { error: 'INVALID_CSV' });
  }
}

import { GxeonErrorResponse, GxeonErrorCode } from '../../src/agent-economy/types.js';

export function sendJson(res: any, statusCode: number, data: unknown, headers?: Record<string, string>): void {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  if (headers) {
    for (const [k, v] of Object.entries(headers)) {
      res.setHeader(k, v);
    }
  }
  res.end(JSON.stringify(data));
}

export function sendError(
  res: any,
  statusCode: number,
  code: GxeonErrorCode,
  message: string,
  details?: unknown
): void {
  const payload: GxeonErrorResponse = {
    error: {
      code,
      message,
      requestId: `req_${Date.now()}`,
      details,
    },
  };
  sendJson(res, statusCode, payload);
}

export async function parseBody(req: any, maxBytes = 1_048_576): Promise<any> {
  const contentLength = Number(req.headers?.['content-length'] || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return null;
  }

  if (req.body && typeof req.body === 'object') {
    const encoded = JSON.stringify(req.body);
    if (Buffer.byteLength(encoded, 'utf8') > maxBytes) return null;
    return req.body;
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    let raw = '';
    let size = 0;
    let rejected = false;
    req.on('data', (chunk: any) => {
      if (rejected) return;
      size += Buffer.byteLength(chunk);
      if (size > maxBytes) {
        rejected = true;
        resolve(null);
        return;
      }
      raw += chunk;
    });
    req.on('end', () => {
      if (rejected) return;
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

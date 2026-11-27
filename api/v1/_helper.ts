import { GxeonErrorResponse, GxeonErrorCode } from '../../src/agent-economy/types.js';

export class RequestBodyTooLargeError extends Error {
  readonly statusCode = 413;
  constructor(readonly maxBytes: number) {
    super(`Request body exceeds the maximum of ${maxBytes} bytes.`);
    this.name = 'RequestBodyTooLargeError';
  }
}

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

const DEFAULT_MAX_BODY_BYTES = 2_100_000;

export async function parseBody(req: any, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    const serialized = JSON.stringify(req.body);
    if (Buffer.byteLength(serialized, 'utf8') > maxBytes) throw new RequestBodyTooLargeError(maxBytes);
    return req.body;
  }
  if (typeof req.body === 'string') {
    if (Buffer.byteLength(req.body, 'utf8') > maxBytes) throw new RequestBodyTooLargeError(maxBytes);
    try {
      return JSON.parse(req.body);
    } catch {
      return null;
    }
  }

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let receivedBytes = 0;
    let settled = false;

    req.on('data', (chunk: Buffer | string) => {
      if (settled) return;
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      receivedBytes += buffer.length;
      if (receivedBytes > maxBytes) {
        settled = true;
        chunks.length = 0;
        req.pause?.();
        reject(new RequestBodyTooLargeError(maxBytes));
        return;
      }
      chunks.push(buffer);
    });
    req.on('end', () => {
      if (settled) return;
      settled = true;
      const raw = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

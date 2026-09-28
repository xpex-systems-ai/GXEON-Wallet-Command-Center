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

export async function parseBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
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
    req.on('data', (chunk: any) => {
      raw += chunk;
    });
    req.on('end', () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve(null);
      }
    });
    req.on('error', () => resolve(null));
  });
}

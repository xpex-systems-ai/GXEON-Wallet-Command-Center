import fs from 'node:fs';
import path from 'node:path';

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  try {
    const candidates = [
      path.join(process.cwd(), 'public', 'openapi.json'),
      path.join(process.cwd(), 'openapi.json'),
      path.join(process.cwd(), 'dist', 'openapi.json'),
    ];

    let content = '';
    for (const p of candidates) {
      if (fs.existsSync(p)) {
        content = fs.readFileSync(p, 'utf-8');
        break;
      }
    }

    if (!content) {
      res.statusCode = 404;
      res.end(JSON.stringify({ error: 'OpenAPI specification not found' }));
      return;
    }

    res.statusCode = 200;
    res.end(content);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: `Internal error: ${msg}` }));
  }
}

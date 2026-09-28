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

  const manifest = {
    name: 'GXEON',
    type: 'agent-capability-market',
    version: '1.0',
    api: 'https://gxeon-wallet-command-center.vercel.app/api/v1',
    openapi: '/openapi.json',
    services: '/api/v1/services',
    quote: '/api/v1/quote',
    jobs: '/api/v1/jobs',
    mcp: '/api/v1/mcp',
    auth: 'api_key',
    billing: [
      'prepaid_credits',
      'metered_account'
    ]
  };

  res.statusCode = 200;
  res.end(JSON.stringify(manifest, null, 2));
}

import { describe, expect, it } from 'vitest';
import handler from '../../api/v1/mcp.js';

function response() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200,
    headers,
    body: undefined as any,
    setHeader(name: string, value: string) { headers[name] = value; },
    end(value?: string) { this.body = value ? JSON.parse(value) : undefined; },
  };
}

async function request(method: string, url: string, body?: unknown) {
  const res = response();
  await handler({ method, url, headers: {}, body }, res);
  return res;
}

describe('GXEON public A2A discovery bridge', () => {
  it('serves a card pointing to the public A2A endpoint', async () => {
    const res = await request('GET', '/api/v1/mcp?view=a2a-card');
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBe('https://gxeon-wallet-command-center.vercel.app/a2a');
    expect(res.body.skills.map((skill: any) => skill.id)).toEqual([
      'discover-gxeon-services',
      'discover-gxeon-credit-packs',
    ]);
    expect(res.body.capabilities.streaming).toBe(false);
  });

  it('returns only public catalog data for message/send', async () => {
    const res = await request('POST', '/api/v1/mcp?view=a2a', {
      jsonrpc: '2.0',
      id: 'discovery-1',
      method: 'message/send',
      params: {
        message: {
          role: 'user',
          messageId: 'discovery-1',
          parts: [{ kind: 'text', text: 'List services and packs' }],
        },
      },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe('discovery-1');
    expect(res.body.result.status.state).toBe('completed');
    const catalog = res.body.result.artifacts[0].parts[1].data;
    expect(catalog.services.length).toBeGreaterThan(0);
    expect(catalog.creditPacks.find((pack: any) => pack.id === 'pack_2')).toMatchObject({
      name: 'PICO',
      priceCents: 99,
    });
    expect(catalog.moneyTruth).toContain('discovery-only');
    expect(JSON.stringify(catalog)).not.toContain('gxa_live_');
  });

  it('rejects unsupported methods and never creates a checkout', async () => {
    const res = await request('POST', '/api/v1/mcp?view=a2a', {
      jsonrpc: '2.0', id: 2, method: 'checkout/create', params: {},
    });
    expect(res.body.error.code).toBe(-32601);
    const get = await request('GET', '/api/v1/mcp?view=a2a');
    expect(get.statusCode).toBe(405);
  });
});

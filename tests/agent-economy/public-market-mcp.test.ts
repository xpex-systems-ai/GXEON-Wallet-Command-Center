import { describe, expect, it } from 'vitest';
import publicMcp from '../../api/v1/mcp.js';

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

async function call(body: any) {
  const res = response();
  await publicMcp({ method: 'POST', url: '/api/v1/mcp?view=public-market', headers: {}, body }, res);
  return res;
}

describe('Public GXEON agent marketplace MCP', () => {
  it('initializes without authentication and advertises only read-only discovery tools', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: { protocolVersion: '2026-07-28' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.body.result.serverInfo).toEqual({
      name: 'gxeon-public-market',
      version: '1.0.0',
    });

    const listed = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(listed.body.result.tools.map((tool: any) => tool.name)).toEqual([
      'gxeon_list_services',
      'gxeon_list_credit_packs',
      'gxeon_get_agent_buying_guide',
    ]);
    expect(
      listed.body.result.tools.every(
        (tool: any) =>
          tool.annotations?.readOnlyHint === true &&
          tool.annotations?.destructiveHint === false
      )
    ).toBe(true);
  });

  it('lets an unauthenticated agent discover the R$0.99 PICO pack without creating payment state', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: { name: 'gxeon_list_credit_packs', arguments: {} },
    });
    const payload = res.body.result.structuredContent;
    expect(payload.rail).toBe('PREPAID_STRIPE');
    expect(payload.currency).toBe('BRL');
    expect(payload.packs.find((pack: any) => pack.id === 'pack_2')).toMatchObject({
      name: 'PICO',
      credits: 2,
      priceCents: 99,
    });
    expect(payload.moneyTruth).toContain('provider-verified settlement');
  });

  it('returns a safe buying guide without embedding a machine key', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 4,
      method: 'tools/call',
      params: { name: 'gxeon_get_agent_buying_guide', arguments: {} },
    });
    const payload = res.body.result.structuredContent;
    expect(payload.createCheckoutEndpoint).toBe('/v1/billing/topup');
    expect(payload.executionMcpEndpoint).toBe('/api/v1/mcp');
    expect(JSON.stringify(payload)).not.toContain('gxa_live_');
    expect(payload.moneyTruth).toContain('not payment');
  });
});

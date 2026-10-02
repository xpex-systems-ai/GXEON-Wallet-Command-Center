import { afterEach, describe, expect, it, vi } from 'vitest';
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

afterEach(() => {
  vi.unstubAllGlobals();
});

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
      version: '1.0.2',
    });

    const listed = await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
    expect(listed.body.result.tools.map((tool: any) => tool.name)).toEqual([
      'gxeon_list_services',
      'gxeon_list_credit_packs',
      'gxeon_plan_purchase',
      'gxeon_list_external_demand',
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

  it('plans the cheapest pack mix for a concrete agent demand without spending money', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: {
        name: 'gxeon_plan_purchase',
        arguments: { serviceId: 'gxeon_url_verify_v1', units: 1 },
      },
    });
    const payload = res.body.result.structuredContent;
    expect(payload.ok).toBe(true);
    expect(payload.requiredCredits).toBe(5);
    expect(payload.totalCredits).toBe(5);
    expect(payload.totalPriceCents).toBe(199);
    expect(payload.purchases).toEqual([
      {
        packId: 'pack_5',
        name: 'BYTE',
        quantity: 1,
        creditsEach: 5,
        priceCentsEach: 199,
      },
    ]);
    expect(payload.moneyTruth).toContain('does not create a checkout');
  });

  it('plans multi-pack capacity for demand larger than a single pack', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 5,
      method: 'tools/call',
      params: {
        name: 'gxeon_plan_purchase',
        arguments: { serviceId: 'gxeon_url_verify_v1', units: 500 },
      },
    });
    const payload = res.body.result.structuredContent;
    expect(payload.ok).toBe(true);
    expect(payload.requiredCredits).toBe(2500);
    expect(payload.totalCredits).toBeGreaterThanOrEqual(2500);
    expect(payload.totalPriceCents).toBe(33000);
    expect(payload.purchases).toEqual([
      {
        packId: 'pack_2000',
        name: 'ENTERPRISE',
        quantity: 1,
        creditsEach: 2000,
        priceCentsEach: 25000,
      },
      {
        packId: 'pack_500',
        name: 'PRO',
        quantity: 1,
        creditsEach: 500,
        priceCentsEach: 8000,
      },
    ]);
  });

  it('rejects demand above the service batch limit without creating payment state', async () => {
    const res = await call({
      jsonrpc: '2.0',
      id: 6,
      method: 'tools/call',
      params: {
        name: 'gxeon_plan_purchase',
        arguments: { serviceId: 'gxeon_api_health_v1', units: 21 },
      },
    });
    const payload = res.body.result.structuredContent;
    expect(payload).toMatchObject({
      ok: false,
      code: 'MAX_BATCH_EXCEEDED',
    });
  });

  it('returns public Speedbot paid-work leads without claiming revenue', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      new Response(JSON.stringify({
        as_of: '2026-10-02T23:47:12.484Z',
        opportunities: [
          {
            id: 'superteam:test',
            source: 'Superteam Earn',
            title: 'Audit one public API endpoint',
            status: 'open',
            reward: {
              currency: 'USDC',
              network: 'Solana/external',
              amount: 25,
              guaranteed: false
            },
            payment_model: 'prize_competition',
            deadline: '2026-10-09T21:59:59.999Z',
            submissions: 12,
            tags: ['api', 'testing'],
            url: 'https://example.com/opportunity',
            speedbot_escrow: false,
            agent_eligibility: 'AGENT_ALLOWED',
            trust: 'External source controls selection and settlement.'
          }
        ],
        access: { tier: 'preview', full_access: false }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    ));

    const res = await call({
      jsonrpc: '2.0',
      id: 8,
      method: 'tools/call',
      params: { name: 'gxeon_list_external_demand', arguments: {} },
    });

    const payload = res.body.result.structuredContent;
    expect(payload.provider).toBe('speedbot');
    expect(payload.opportunities).toHaveLength(1);
    expect(payload.opportunities[0]).toMatchObject({
      source: 'Superteam Earn',
      rewardAmount: 25,
      rewardCurrency: 'USDC',
      speedbotEscrow: false,
      agentEligibility: 'AGENT_ALLOWED',
    });
    expect(payload.moneyTruth).toContain('not GXEON revenue');
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

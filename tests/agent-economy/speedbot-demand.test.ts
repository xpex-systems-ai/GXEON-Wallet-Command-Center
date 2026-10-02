import { describe, expect, it, vi } from 'vitest';
import {
  fetchSpeedbotExternalOpportunities,
  parseSpeedbotExternalFeed,
  SPEEDBOT_OPPORTUNITIES_URL,
} from '../../src/agent-economy/connectors/speedbotConnector.js';

function response(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

const fixture = {
  as_of: '2026-10-02T23:47:12.484Z',
  opportunities: [
    {
      id: 'taskmarket:abc',
      source: 'Taskmarket',
      title: 'Verify a public API response',
      status: 'open',
      reward: {
        currency: 'USDC',
        network: 'Base',
        amount: 2,
        guaranteed: false,
      },
      payment_model: 'prize_competition',
      deadline: '2026-10-03T01:44:28.405Z',
      submissions: 10,
      tags: ['api-testing', 'verification'],
      url: 'https://taskmarket.dev/tasks/abc',
      speedbot_escrow: false,
      agent_eligibility: 'AGENT_ALLOWED',
      trust: 'Live source metadata; external source decides selection and settlement.',
    },
  ],
  access: {
    tier: 'preview',
    full_access: false,
  },
};

describe('Speedbot external opportunity connector', () => {
  it('uses a public GET with no auth, cookies, payment headers or redirects', async () => {
    const fetcher = vi.fn(async () => response(fixture));
    const feed = await fetchSpeedbotExternalOpportunities(fetcher as typeof fetch);

    expect(feed.opportunities).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledWith(
      SPEEDBOT_OPPORTUNITIES_URL,
      expect.objectContaining({
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'error',
      })
    );

    const init = fetcher.mock.calls[0]?.[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(JSON.stringify(headers)).not.toMatch(/authorization|cookie|payment/i);
  });

  it('preserves conditional reward and external settlement truth', () => {
    const feed = parseSpeedbotExternalFeed(fixture);
    expect(feed).toMatchObject({
      accessTier: 'preview',
      fullAccess: false,
      opportunities: [
        expect.objectContaining({
          source: 'Taskmarket',
          rewardAmount: 2,
          rewardCurrency: 'USDC',
          guaranteed: false,
          speedbotEscrow: false,
        }),
      ],
    });
    expect(feed.moneyTruth).toContain('not GXEON revenue');
  });

  it('rejects unsafe external URLs and malformed reward data', () => {
    expect(() =>
      parseSpeedbotExternalFeed({
        ...fixture,
        opportunities: [
          {
            ...fixture.opportunities[0],
            url: 'http://127.0.0.1/private',
          },
        ],
      })
    ).toThrow('SPEEDBOT_UNSAFE_URL');

    expect(() =>
      parseSpeedbotExternalFeed({
        ...fixture,
        opportunities: [
          {
            ...fixture.opportunities[0],
            reward: {
              ...fixture.opportunities[0].reward,
              amount: -1,
            },
          },
        ],
      })
    ).toThrow('SPEEDBOT_MALFORMED_API');
  });

  it('fails closed on provider HTTP errors', async () => {
    const fetcher = vi.fn(async () => response({ error: 'no' }, 503));
    await expect(
      fetchSpeedbotExternalOpportunities(fetcher as typeof fetch)
    ).rejects.toThrow('SPEEDBOT_HTTP_503');
  });
});

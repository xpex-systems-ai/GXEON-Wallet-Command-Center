import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { construct, listCharges } = vi.hoisted(() => ({
  construct: vi.fn(),
  listCharges: vi.fn(),
}));

vi.mock('stripe', () => ({
  default: class StripeClientMock {
    charges = { list: listCharges };
    constructor(key: string, options: Record<string, unknown>) {
      construct(key, options);
    }
  },
}));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  listCharges.mockReset();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_live_fixture_for_provider_regression');
  vi.stubEnv('STRIPE_API_KEY', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('Stripe provider client accounting contract', () => {
  it('pins Basil and the same charge-creation window across real client pagination', async () => {
    const observedAt = '2026-10-09T00:00:00.000Z';
    vi.useFakeTimers();
    vi.setSystemTime(new Date(observedAt));
    listCharges
      .mockResolvedValueOnce({
        data: [{
          id: 'ch_partial_fixture', livemode: true, status: 'succeeded',
          paid: true, captured: true, currency: 'brl',
          amount: 2000, amount_captured: 1000, amount_refunded: 400,
          disputed: false,
        }],
        has_more: true,
      })
      .mockResolvedValueOnce({ data: [], has_more: false });

    const { readStripeLiveMoneyTruth } = await import('./stripeLiveMoneyTruth');
    const result = await readStripeLiveMoneyTruth();

    expect(construct).toHaveBeenCalledTimes(1);
    expect(construct).toHaveBeenCalledWith(
      'sk_live_fixture_for_provider_regression',
      { apiVersion: '2025-03-31.basil', timeout: 6500, maxNetworkRetries: 0 },
    );
    const end = Math.floor(Date.parse(observedAt) / 1000);
    const window = { gte: end - 30 * 86400, lte: end };
    expect(listCharges).toHaveBeenNthCalledWith(1, { limit: 100, created: window });
    expect(listCharges).toHaveBeenNthCalledWith(2, {
      limit: 100, created: window, starting_after: 'ch_partial_fixture',
    });
    expect(result).toMatchObject({
      status: 'PROVIDER_VERIFIED', observedAt, pagesFetched: 2,
      windowStartUnix: window.gte, windowEndUnix: window.lte,
      grossBRLCents: 1000, refundedBRLCents: 400,
      capturedMinusRefundedBRLCents: 600,
    });
  });
});

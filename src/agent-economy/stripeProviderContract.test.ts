import { afterEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  newStripe: vi.fn(),
  listCharges: vi.fn(),
}));

// This test checks the real readStripeLiveMoneyTruth adapter's Stripe constructor
// and API arguments, not merely the pure normalizer.
vi.mock('stripe', () => ({
  default: class StripeTestDouble {
    charges = { list: mock.listCharges };
    constructor(_secret: string, options: unknown) {
      mock.newStripe(options);
    }
  },
}));

import { readStripeLiveMoneyTruth } from './stripeLiveMoneyTruth';

const oldSecret = process.env.STRIPE_SECRET_KEY;
const oldApiKey = process.env.STRIPE_API_KEY;
afterEach(() => {
  if (oldSecret === undefined) delete process.env.STRIPE_SECRET_KEY;
  else process.env.STRIPE_SECRET_KEY = oldSecret;
  if (oldApiKey === undefined) delete process.env.STRIPE_API_KEY;
  else process.env.STRIPE_API_KEY = oldApiKey;
});

describe('Stripe provider adapter contract', () => {
  it('uses Basil version and a pinned 30-day charge cohort without writes', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_live_unit_test_only_not_a_real_key';
    delete process.env.STRIPE_API_KEY;
    mock.listCharges.mockResolvedValueOnce({ data: [], has_more: false });
    const result = await readStripeLiveMoneyTruth();
    expect(result.status).toBe('PROVIDER_VERIFIED');
    expect(mock.newStripe).toHaveBeenCalledWith(expect.objectContaining({
      apiVersion: '2025-03-31.basil',
      maxNetworkRetries: 0,
    }));
    expect(mock.listCharges).toHaveBeenCalledTimes(1);
    const params = mock.listCharges.mock.calls[0][0];
    expect(params.limit).toBe(100);
    expect(params.created.gte).toEqual(expect.any(Number));
    expect(params.created.lte).toEqual(expect.any(Number));
    expect(params.created.lte - params.created.gte).toBe(30 * 86400);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  isFreshVerifiedSnapshot, readPublishedStripeMoneyTruth,
  refreshPublishedStripeMoneyTruth, unavailableStripeMoneyTruth,
} from './stripePublishedSnapshot';
import type { PublicStripeMoneyTruth } from './stripeLiveMoneyTruth';

const now = new Date().toISOString();
const verified = (): PublicStripeMoneyTruth => ({
  status: 'PROVIDER_VERIFIED',
  observedAt: now,
  source: 'STRIPE_LIVE_CHARGES',
  scope: 'CONNECTED_STRIPE_ACCOUNT_LAST_30_DAYS',
  windowStartUnix: Math.floor(Date.now()/1000) - 30*86400,
  windowEndUnix: Math.floor(Date.now()/1000),
  maxPages: 5,
  pagesFetched: 1,
  exhaustive: true,
  paidCharges: 2,
  grossBRLCents: 1000,
  refundedBRLCents: 100,
  capturedMinusRefundedBRLCents: 900,
  otherCurrencyPaidCharges: 0,
  disputedCharges: 0,
  note: 'Provider charge snapshot only.',
});

describe('durable published money truth', () => {
  it('only shows a fully verified fresh provider aggregate', () => {
    expect(isFreshVerifiedSnapshot(verified())).toBe(true);
    expect(isFreshVerifiedSnapshot({...verified(), exhaustive: false})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), status: 'PARTIAL'})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), paidCharges: -1})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), observedAt: '2024-01-01T00:00:00.000Z'})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), observedAt: '2099-01-01T00:00:00.000Z'})).toBe(false);
  });
  it('uses stored provider proof, never triggers Stripe from a public GET', async () => {
    const get = vi.fn().mockResolvedValue({data: verified()});
    const result = await readPublishedStripeMoneyTruth({get});
    expect(get).toHaveBeenCalledWith('financial_provider_snapshots', 'stripe_live_30day_charges');
    expect(result.status).toBe('PROVIDER_VERIFIED');
    expect(result.capturedMinusRefundedBRLCents).toBe(900);
  });
  it('stale or missing provider snapshot means unavailable, not R$0', async () => {
    const missing = await readPublishedStripeMoneyTruth({get: vi.fn().mockResolvedValue(null)});
    expect(missing.status).toBe('UNAVAILABLE');
    expect(missing.capturedMinusRefundedBRLCents).toBeNull();
    const stale = await readPublishedStripeMoneyTruth({
      get: vi.fn().mockResolvedValue({data: {...verified(), observedAt: '2024-01-01T00:00:00Z'}}),
    });
    expect(stale.status).toBe('UNAVAILABLE');
    expect(stale.paidCharges).toBeNull();
  });
  it('writes a new snapshot only after full provider verification', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const saved = await refreshPublishedStripeMoneyTruth({set}, async () => verified());
    expect(saved.status).toBe('PROVIDER_VERIFIED');
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe('financial_provider_snapshots');
  });
  it('never overwrites last good snapshot on a partial/incomplete Stripe read', async () => {
    const set = vi.fn();
    const unavailable = unavailableStripeMoneyTruth();
    const result = await refreshPublishedStripeMoneyTruth({set}, async () => unavailable);
    expect(result.status).toBe('UNAVAILABLE');
    expect(set).not.toHaveBeenCalled();
  });
});

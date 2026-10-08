import { describe, expect, it, vi } from 'vitest';
import {
  isFreshVerifiedSnapshot, readPublishedStripeMoneyTruth,
  refreshPublishedStripeMoneyTruth, unavailableStripeMoneyTruth,
} from './stripePublishedSnapshot';
import type { PublicStripeMoneyTruth } from './stripeLiveMoneyTruth';

const now = new Date().toISOString();
const binding = 'test-credential-binding';
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
    const get = vi.fn().mockResolvedValue({data: {snapshot: verified(), credentialBinding: binding}});
    const result = await readPublishedStripeMoneyTruth({get}, binding);
    expect(get).toHaveBeenCalledWith('financial_provider_snapshots', 'stripe_live_30day_charges');
    expect(result.status).toBe('PROVIDER_VERIFIED');
    expect(result.capturedMinusRefundedBRLCents).toBe(900);
  });
  it('stale or missing provider snapshot means unavailable, not R$0', async () => {
    const missing = await readPublishedStripeMoneyTruth({get: vi.fn().mockResolvedValue(null)}, binding);
    expect(missing.status).toBe('UNAVAILABLE');
    expect(missing.capturedMinusRefundedBRLCents).toBeNull();
    const stale = await readPublishedStripeMoneyTruth({
      get: vi.fn().mockResolvedValue({data: {credentialBinding: binding, snapshot: {...verified(), observedAt: '2024-01-01T00:00:00Z'}}}),
    }, binding);
    expect(stale.status).toBe('UNAVAILABLE');
    expect(stale.paidCharges).toBeNull();
  });
  it('rejects valid snapshots tied to another Stripe live credential', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { snapshot: verified(), credentialBinding: 'other-live-account' },
    });
    const result = await readPublishedStripeMoneyTruth({get}, binding);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.grossBRLCents).toBeNull();
  });
  it('does not reveal or read provider proof without a live credential', async () => {
    const get = vi.fn();
    const result = await readPublishedStripeMoneyTruth({get}, null);
    expect(get).not.toHaveBeenCalled();
    expect(result.status).toBe('UNAVAILABLE');
  });

  it('writes a new snapshot only after full provider verification', async () => {
    const set = vi.fn().mockResolvedValue(undefined);
    const saved = await refreshPublishedStripeMoneyTruth({set}, async () => verified(), binding);
    expect(saved.status).toBe('PROVIDER_VERIFIED');
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toBe('financial_provider_snapshots');
    expect(set.mock.calls[0][2]).toMatchObject({credentialBinding: binding, snapshot: {status: 'PROVIDER_VERIFIED'}});
  });
  it('never overwrites last good snapshot on a partial/incomplete Stripe read', async () => {
    const set = vi.fn();
    const unavailable = unavailableStripeMoneyTruth();
    const result = await refreshPublishedStripeMoneyTruth({set}, async () => unavailable, binding);
    expect(result.status).toBe('UNAVAILABLE');
    expect(set).not.toHaveBeenCalled();
  });
});

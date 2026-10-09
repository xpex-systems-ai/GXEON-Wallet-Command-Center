import { describe, expect, it, vi } from 'vitest';
import {
  isFreshVerifiedSnapshot, readPublishedStripeMoneyTruth,
  refreshPublishedStripeMoneyTruth, unavailableStripeMoneyTruth,
} from './stripePublishedSnapshot';
import type { PublicStripeMoneyTruth } from './stripeLiveMoneyTruth';

const binding = 'test-credential-binding';
const verified = (): PublicStripeMoneyTruth => {
  const observedAt = new Date().toISOString();
  const windowEndUnix = Math.floor(Date.parse(observedAt) / 1000);
  return ({
  status: 'PROVIDER_VERIFIED',
  observedAt,
  source: 'STRIPE_LIVE_CHARGES',
  scope: 'CONNECTED_STRIPE_ACCOUNT_LAST_30_DAYS',
  windowStartUnix: Math.max(0, windowEndUnix - 30 * 86400),
  windowEndUnix,
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
};

describe('durable published money truth', () => {
  it('only shows a fully verified fresh provider aggregate', () => {
    expect(isFreshVerifiedSnapshot(verified())).toBe(true);
    expect(isFreshVerifiedSnapshot({...verified(), exhaustive: false})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), status: 'PARTIAL'})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), paidCharges: -1})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), observedAt: '2024-01-01T00:00:00.000Z'})).toBe(false);
    expect(isFreshVerifiedSnapshot({...verified(), observedAt: '2099-01-01T00:00:00.000Z'})).toBe(false);
  });

  it.each(['old', 'future', 'one-second', 'longer', 'negative-start'] as const)(
    'rejects a fresh observation with a %s charge window',
    kind => {
      const snapshot = verified();
      const end = snapshot.windowEndUnix!;
      if (kind === 'old' || kind === 'future') {
        const offset = kind === 'old' ? -86400 : 86400;
        snapshot.windowStartUnix = snapshot.windowStartUnix! + offset;
        snapshot.windowEndUnix = snapshot.windowEndUnix! + offset;
      } else if (kind === 'one-second') {
        snapshot.windowStartUnix = end - 1;
      } else if (kind === 'longer') {
        snapshot.windowStartUnix = snapshot.windowStartUnix! - 1;
      } else {
        snapshot.windowStartUnix = -1;
      }
      expect(isFreshVerifiedSnapshot(snapshot)).toBe(false);
    },
  );
  it('matches observation milliseconds to the same whole-second provider boundary', () => {
    const snapshot = verified();
    snapshot.observedAt = new Date(snapshot.windowEndUnix! * 1000 + 123).toISOString();
    expect(isFreshVerifiedSnapshot(snapshot, snapshot.windowEndUnix! * 1000 + 456)).toBe(true);
  });
  it('rejects positive BRL money when no paid BRL charges exist', () => {
    expect(isFreshVerifiedSnapshot({...verified(), paidCharges: 0})).toBe(false);
    expect(isFreshVerifiedSnapshot({
      ...verified(), paidCharges: 0, grossBRLCents: 1000,
      refundedBRLCents: 1000, capturedMinusRefundedBRLCents: 0,
    })).toBe(false);
    expect(isFreshVerifiedSnapshot({
      ...verified(), paidCharges: 0, grossBRLCents: 0, refundedBRLCents: 0,
      capturedMinusRefundedBRLCents: 0, otherCurrencyPaidCharges: 3,
    })).toBe(true);
  });
  it.each(['wrong-window', 'zero-paid-positive-money'] as const)(
    'makes a corrupt %s stored proof unavailable to public readers',
    async kind => {
      const snapshot = verified();
      if (kind === 'wrong-window') snapshot.windowStartUnix = snapshot.windowEndUnix! - 1;
      else snapshot.paidCharges = 0;
      const result = await readPublishedStripeMoneyTruth({
        get: vi.fn().mockResolvedValue({data: {snapshot, credentialBinding: binding}}),
      }, binding);
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.paidCharges).toBeNull();
      expect(result.capturedMinusRefundedBRLCents).toBeNull();
    },
  );
  it.each(['wrong-window', 'zero-paid-positive-money'] as const)(
    'does not persist or report a malformed %s provider aggregate as verified',
    async kind => {
      const snapshot = verified();
      if (kind === 'wrong-window') snapshot.windowStartUnix = snapshot.windowEndUnix! - 1;
      else snapshot.paidCharges = 0;
      const set = vi.fn();
      const result = await refreshPublishedStripeMoneyTruth({set}, async () => snapshot, binding);
      expect(set).not.toHaveBeenCalled();
      expect(result.status).toBe('UNAVAILABLE');
      expect(result.capturedMinusRefundedBRLCents).toBeNull();
    },
  );

  it('rejects impossible gross, refunds and net arithmetic despite fresh provider labels', () => {
    expect(isFreshVerifiedSnapshot({
      ...verified(), grossBRLCents: 1000, refundedBRLCents: 900,
      capturedMinusRefundedBRLCents: 1000,
    })).toBe(false);
    expect(isFreshVerifiedSnapshot({
      ...verified(), grossBRLCents: 1000, refundedBRLCents: 1200,
      capturedMinusRefundedBRLCents: 0,
    })).toBe(false);
    expect(isFreshVerifiedSnapshot({
      ...verified(), disputedCharges: 3, paidCharges: 2,
    })).toBe(false);
  });
  it('never exposes corrupted stored accounting proof as verified provider income', async () => {
    const corrupted = {
      ...verified(), grossBRLCents: 1000, refundedBRLCents: 900,
      capturedMinusRefundedBRLCents: 1000,
    };
    const result = await readPublishedStripeMoneyTruth({
      get: vi.fn().mockResolvedValue({ data: {
        snapshot: corrupted, credentialBinding: binding,
      } }),
    }, binding);
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.capturedMinusRefundedBRLCents).toBeNull();
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

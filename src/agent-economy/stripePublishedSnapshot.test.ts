import { describe, expect, it, vi } from 'vitest';
import {
  isFreshVerifiedSnapshot, readPublishedStripeMoneyTruth,
  refreshPublishedStripeMoneyTruth, unavailableStripeMoneyTruth,
} from './stripePublishedSnapshot';
import type { PublicStripeMoneyTruth } from './stripeLiveMoneyTruth';

const binding = 'test-credential-binding';
const verified = (observedAt = new Date().toISOString()): PublicStripeMoneyTruth => {
  const windowEndUnix = Math.floor(Date.parse(observedAt) / 1000);
  return {
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
  };
};

const writer = () => ({
  get: vi.fn().mockResolvedValue(null),
  makeUpdateWrite: vi.fn((collection: string, id: string, data: Record<string, unknown>,
    options?: { exists?: boolean; updateTime?: string }) => ({
    update: { collection, id, data }, currentDocument: options,
  })),
  conditionalCommit: vi.fn().mockResolvedValue('COMMITTED'),
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


  it.each([
    {pagesFetched: 0}, {pagesFetched: -1}, {pagesFetched: 6}, {pagesFetched: 1.5},
    {maxPages: 0}, {maxPages: -1}, {maxPages: 6}, {maxPages: 5.5},
  ])('rejects impossible or incompatible pagination metadata %j', fields => {
    expect(isFreshVerifiedSnapshot({...verified(), ...fields})).toBe(false);
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
      const store = writer();
      const result = await refreshPublishedStripeMoneyTruth(store, async () => snapshot, binding);
      expect(store.get).not.toHaveBeenCalled();
      expect(store.conditionalCommit).not.toHaveBeenCalled();
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


  it('writes a new snapshot only after full provider verification with a creation precondition', async () => {
    const store = writer();
    const saved = await refreshPublishedStripeMoneyTruth(store, async () => verified(), binding);
    expect(saved.status).toBe('PROVIDER_VERIFIED');
    expect(store.makeUpdateWrite).toHaveBeenCalledWith(
      'financial_provider_snapshots', 'stripe_live_30day_charges',
      expect.objectContaining({credentialBinding: binding, snapshot: expect.objectContaining({status: 'PROVIDER_VERIFIED'})}),
      {exists: false},
    );
    expect(store.conditionalCommit).toHaveBeenCalledTimes(1);
  });
  it('never overwrites last good snapshot on a partial/incomplete Stripe read', async () => {
    const store = writer();
    const result = await refreshPublishedStripeMoneyTruth(store, async () => unavailableStripeMoneyTruth(), binding);
    expect(result.status).toBe('UNAVAILABLE');
    expect(store.get).not.toHaveBeenCalled();
    expect(store.conditionalCommit).not.toHaveBeenCalled();
  });
  it('preserves the newer proof when a slower provider scan finishes last', async () => {
    const store = writer();
    const newer = verified(new Date(Date.now() - 1000).toISOString());
    const older = verified(new Date(Date.now() - 2000).toISOString());
    store.get.mockResolvedValue({data: {snapshot: newer, credentialBinding: binding}, updateTime: 'version-new'});
    const result = await refreshPublishedStripeMoneyTruth(store, async () => older, binding);
    expect(result).toEqual(newer);
    expect(store.conditionalCommit).not.toHaveBeenCalled();
  });
  it('prevents a retiring Stripe credential cron from overwriting a later proof', async () => {
    const store = writer();
    const later = verified(new Date(Date.now() - 1000).toISOString());
    const earlier = verified(new Date(Date.now() - 3000).toISOString());
    store.get.mockResolvedValue({
      data: {snapshot: later, credentialBinding: 'new-stripe-key-binding'},
      updateTime: 'new-account-proof-version',
    });
    const result = await refreshPublishedStripeMoneyTruth(
      store, async () => earlier, 'old-stripe-key-binding',
    );
    expect(result.status).toBe('UNAVAILABLE');
    expect(result.paidCharges).toBeNull();
    expect(store.makeUpdateWrite).not.toHaveBeenCalled();
    expect(store.conditionalCommit).not.toHaveBeenCalled();
  });

  it('guards an existing proof with its Firestore version', async () => {
    const store = writer();
    const older = verified(new Date(Date.now() - 2000).toISOString());
    store.get.mockResolvedValue({data: {snapshot: older, credentialBinding: binding}, updateTime: 'version-old'});
    const result = await refreshPublishedStripeMoneyTruth(store, async () => verified(), binding);
    expect(result.status).toBe('PROVIDER_VERIFIED');
    expect(store.makeUpdateWrite.mock.calls[0][3]).toEqual({updateTime: 'version-old'});
  });
  it('rereads after a CAS conflict and preserves a winning newer observation', async () => {
    const store = writer();
    const older = verified(new Date(Date.now() - 3000).toISOString());
    const candidate = verified(new Date(Date.now() - 2000).toISOString());
    const winner = verified(new Date(Date.now() - 1000).toISOString());
    store.get.mockResolvedValueOnce({data: {snapshot: older, credentialBinding: binding}, updateTime: 'version-old'})
      .mockResolvedValueOnce({data: {snapshot: winner, credentialBinding: binding}, updateTime: 'version-winner'});
    store.conditionalCommit.mockResolvedValueOnce('CONFLICT');
    const result = await refreshPublishedStripeMoneyTruth(store, async () => candidate, binding);
    expect(result).toEqual(winner);
    expect(store.get).toHaveBeenCalledTimes(2);
    expect(store.conditionalCommit).toHaveBeenCalledTimes(1);
  });
  it('retries a creation race safely and replaces only the older winning document', async () => {
    const store = writer();
    const candidate = verified();
    const older = verified(new Date(Date.now() - 1000).toISOString());
    store.get.mockResolvedValueOnce(null)
      .mockResolvedValueOnce({data: {snapshot: older, credentialBinding: binding}, updateTime: 'race-version'});
    store.conditionalCommit.mockResolvedValueOnce('CONFLICT').mockResolvedValueOnce('COMMITTED');
    expect((await refreshPublishedStripeMoneyTruth(store, async () => candidate, binding)).status).toBe('PROVIDER_VERIFIED');
    expect(store.makeUpdateWrite.mock.calls[0][3]).toEqual({exists: false});
    expect(store.makeUpdateWrite.mock.calls[1][3]).toEqual({updateTime: 'race-version'});
  });
  it('fails closed instead of using an unconditional write after repeated conflicts', async () => {
    const store = writer();
    store.conditionalCommit.mockResolvedValue('CONFLICT');
    const result = await refreshPublishedStripeMoneyTruth(store, async () => verified(), binding);
    expect(result.status).toBe('UNAVAILABLE');
    expect(store.get).toHaveBeenCalledTimes(3);
    expect(store.conditionalCommit).toHaveBeenCalledTimes(3);
  });
  it('does not replace an existing document whose version is unavailable', async () => {
    const store = writer();
    store.get.mockResolvedValue({data: {snapshot: verified(new Date(Date.now() - 1000).toISOString()), credentialBinding: binding}});
    expect((await refreshPublishedStripeMoneyTruth(store, async () => verified(), binding)).status).toBe('UNAVAILABLE');
    expect(store.conditionalCommit).not.toHaveBeenCalled();
  });
});

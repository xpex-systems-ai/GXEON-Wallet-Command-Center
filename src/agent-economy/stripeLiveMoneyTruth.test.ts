import { describe, expect, it } from 'vitest';
import {
  formatBrlCents, MAX_STRIPE_CHARGE_PAGES, reconcileLiveCharges,
  type ChargePage,
} from './stripeLiveMoneyTruth';

const successful = (id: string, amount = 9900, refund = 0) => ({
  id, livemode: true, status: 'succeeded', paid: true,
  captured: true, amount, amount_refunded: refund, currency: 'brl',
  disputed: false,
});

describe('Stripe account-wide money truth from real provider snapshots', () => {
  it('reports verified 0, not inferred internal payments, for empty complete charge history', async () => {
    const r = await reconcileLiveCharges(async () => ({ data: [], has_more: false }));
    expect(r).toMatchObject({
      status: 'PROVIDER_VERIFIED', exhaustive: true, paidCharges: 0,
      grossBRLCents: 0, refundedBRLCents: 0,
      capturedMinusRefundedBRLCents: 0, source: 'STRIPE_LIVE_CHARGES',
    });
  });
  it('counts only successful LIVE captured BRL charges; refunds are distinct from cash balance', async () => {
    const first: ChargePage = {
      data: [
        successful('ch_1', 2000, 500),
        { ...successful('ch_failed'), paid: false, status: 'failed' },
        { ...successful('ch_pending'), captured: false },
      ], has_more: true,
    };
    const second: ChargePage = {
      data: [successful('ch_2', 9900, 0), { ...successful('ch_usd'), currency: 'usd' }],
      has_more: false,
    };
    const seen: Array<string | undefined> = [];
    const r = await reconcileLiveCharges(async cursor => {
      seen.push(cursor);
      return seen.length === 1 ? first : second;
    });
    expect(seen).toEqual([undefined, 'ch_pending']);
    expect(r).toMatchObject({
      status: 'PROVIDER_VERIFIED', paidCharges: 2, grossBRLCents: 11900,
      refundedBRLCents: 500, capturedMinusRefundedBRLCents: 11400,
      otherCurrencyPaidCharges: 1, pagesFetched: 2,
    });
  });
  it('never credits a test charge or a paid-but-uncaptured charge', async () => {
    const r = await reconcileLiveCharges(async () => ({
      data: [
        { ...successful('ch_test'), livemode: false },
        { ...successful('ch_unconfirmed'), captured: false },
      ], has_more: false,
    }));
    expect(r.status).toBe('PARTIAL'); // suspicious non-live charge in LIVE reconciliation
    expect(r.paidCharges).toBeNull();
  });
  it('fails closed rather than publishing partial income after a rate limit', async () => {
    let pages = 0;
    const r = await reconcileLiveCharges(async () => {
      if (++pages === 2) throw new Error('stripe unavailable');
      return { data: [successful('ch_a')], has_more: true };
    });
    expect(r.status).toBe('PARTIAL');
    expect(r.paidCharges).toBeNull();
    expect(r.grossBRLCents).toBeNull();
  });
  it('fails closed on malformed refund and duplicate charge IDs', async () => {
    const badRefund = await reconcileLiveCharges(async () => ({
      data: [successful('ch_bad', 1000, 1300)], has_more: false,
    }));
    expect(badRefund.status).toBe('PARTIAL');
    const duplicate = await reconcileLiveCharges(async () => ({
      data: [successful('ch_a'), successful('ch_a')], has_more: false,
    }));
    expect(duplicate.status).toBe('PARTIAL');
  });
  it('does not announce fully reconciled history when pagination is capped', async () => {
    let page = 0;
    const r = await reconcileLiveCharges(async () => ({
      data: [successful('ch_' + ++page)],
      has_more: true,
    }));
    expect(page).toBe(MAX_STRIPE_CHARGE_PAGES);
    expect(r.status).toBe('PARTIAL');
    expect(r.exhaustive).toBe(false);
    expect(r.capturedMinusRefundedBRLCents).toBeNull();
  });
  it('formats BRL cents while preserving unavailable status', () => {
    expect(formatBrlCents(0)).toBe('R$0.00');
    expect(formatBrlCents(1234)).toBe('R$12.34');
    expect(formatBrlCents(null)).toBe('INDISPONÍVEL');
  });
});

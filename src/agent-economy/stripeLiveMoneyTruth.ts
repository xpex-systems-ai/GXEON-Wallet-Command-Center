/**
 * Provider-authoritative Stripe LIVE charge reconciliation for aggregate dashboard metrics.
 * No personal data, payment identifiers or secret keys are exposed to the browser.
 * Stripe charge capture is not a payout: amounts exclude Stripe fees and transfers.
 */
import Stripe from 'stripe';

export type StripeMoneyTruthStatus = 'PROVIDER_VERIFIED' | 'PARTIAL' | 'UNAVAILABLE';
export interface PublicStripeMoneyTruth {
  status: StripeMoneyTruthStatus;
  observedAt: string;
  source: 'STRIPE_LIVE_CHARGES' | 'UNAVAILABLE';
  scope: 'CONNECTED_STRIPE_ACCOUNT_ALL_PRODUCTS';
  maxPages: number;
  pagesFetched: number;
  exhaustive: boolean;
  paidCharges: number | null;
  grossBRLCents: number | null;
  refundedBRLCents: number | null;
  capturedMinusRefundedBRLCents: number | null;
  otherCurrencyPaidCharges: number | null;
  disputedCharges: number | null;
  note: string;
}

export interface ChargeRecord {
  id: string;
  livemode?: boolean;
  status?: string;
  paid?: boolean;
  captured?: boolean;
  currency?: string;
  amount?: number;
  amount_refunded?: number;
  disputed?: boolean;
}
export interface ChargePage {
  data: ChargeRecord[];
  has_more: boolean;
}
export type ChargePageReader = (cursor?: string) => Promise<ChargePage>;
export const MAX_STRIPE_CHARGE_PAGES = 5;

function blank(observedAt: string, status: StripeMoneyTruthStatus, pagesFetched = 0): PublicStripeMoneyTruth {
  return {
    status, observedAt, source: 'UNAVAILABLE',
    scope: 'CONNECTED_STRIPE_ACCOUNT_ALL_PRODUCTS',
    maxPages: MAX_STRIPE_CHARGE_PAGES, pagesFetched, exhaustive: false,
    paidCharges: null, grossBRLCents: null, refundedBRLCents: null,
    capturedMinusRefundedBRLCents: null, otherCurrencyPaidCharges: null,
    disputedCharges: null,
    note: 'No authoritative revenue figure: payment-provider scan incomplete or unavailable.',
  };
}

/** Purely read-only. Any incomplete pagination or malformed data fails closed. */
export async function reconcileLiveCharges(
  readPage: ChargePageReader,
  observedAt = new Date().toISOString(),
): Promise<PublicStripeMoneyTruth> {
  let pagesFetched = 0;
  let cursor: string | undefined;
  const seen = new Set<string>();
  let gross = 0;
  let refunded = 0;
  let paid = 0;
  let otherCurrencies = 0;
  let disputed = 0;
  try {
    for (let pageIndex = 0; pageIndex < MAX_STRIPE_CHARGE_PAGES; pageIndex++) {
      const page = await readPage(cursor);
      if (!page || !Array.isArray(page.data) || typeof page.has_more !== 'boolean') {
        return blank(observedAt, 'PARTIAL', pagesFetched);
      }
      pagesFetched++;
      for (const charge of page.data) {
        if (typeof charge.id !== 'string' || seen.has(charge.id)) {
          return blank(observedAt, 'PARTIAL', pagesFetched);
        }
        seen.add(charge.id);
        if (charge.status !== 'succeeded' || charge.paid !== true || charge.captured !== true) {
          continue;
        }
        if (charge.livemode !== true || typeof charge.currency !== 'string'
          || !Number.isSafeInteger(charge.amount) || (charge.amount ?? -1) < 0
          || !Number.isSafeInteger(charge.amount_refunded) || (charge.amount_refunded ?? -1) < 0
          || (charge.amount_refunded ?? Infinity) > (charge.amount ?? 0)) {
          return blank(observedAt, 'PARTIAL', pagesFetched);
        }
        if (charge.disputed === true) disputed++;
        if (charge.currency.toLowerCase() !== 'brl') {
          otherCurrencies++;
          continue;
        }
        paid++;
        gross += charge.amount!;
        refunded += charge.amount_refunded!;
        if (!Number.isSafeInteger(gross) || !Number.isSafeInteger(refunded)) {
          return blank(observedAt, 'PARTIAL', pagesFetched);
        }
      }
      if (!page.has_more) {
        return {
          status: 'PROVIDER_VERIFIED', observedAt, source: 'STRIPE_LIVE_CHARGES',
          scope: 'CONNECTED_STRIPE_ACCOUNT_ALL_PRODUCTS',
          maxPages: MAX_STRIPE_CHARGE_PAGES, pagesFetched, exhaustive: true,
          paidCharges: paid, grossBRLCents: gross, refundedBRLCents: refunded,
          // This is captured less refunds, not Stripe available balance, fees or payout.
          capturedMinusRefundedBRLCents: gross - refunded,
          otherCurrencyPaidCharges: otherCurrencies,
          disputedCharges: disputed,
          note: 'Live captured charges in BRL across the connected Stripe account, less charge refunds. Excludes Stripe fees, disputes, payout status and other currencies; NOT a withdrawable balance.',
        };
      }
      const next = page.data[page.data.length - 1]?.id;
      if (!next || next === cursor) return blank(observedAt, 'PARTIAL', pagesFetched);
      cursor = next;
    }
    return blank(observedAt, 'PARTIAL', pagesFetched);
  } catch {
    return blank(observedAt, pagesFetched > 0 ? 'PARTIAL' : 'UNAVAILABLE', pagesFetched);
  }
}

// Bounded provider polling: avoid one Stripe API roundtrip per public dashboard request.
let cached: { expiresAt: number; promise: Promise<PublicStripeMoneyTruth> } | undefined;
const CACHE_MS = 120_000;
export async function readStripeLiveMoneyTruth(): Promise<PublicStripeMoneyTruth> {
  const stripeKey = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '').trim();
  if (!/^(sk_live_|rk_live_)/.test(stripeKey)) {
    return blank(new Date().toISOString(), 'UNAVAILABLE');
  }
  const now = Date.now();
  if (cached && cached.expiresAt > now) return cached.promise;
  const promise = (async () => {
    try {
      const client = new Stripe(stripeKey, {
        apiVersion: '2025-02-24.acacia' as any,
        timeout: 6500,
        maxNetworkRetries: 0,
      });
      return await reconcileLiveCharges(async cursor => {
        const response = await client.charges.list({
          limit: 100,
          ...(cursor ? { starting_after: cursor } : {}),
        });
        return { data: response.data, has_more: response.has_more };
      });
    } catch {
      return blank(new Date().toISOString(), 'UNAVAILABLE');
    }
  })();
  cached = { expiresAt: now + CACHE_MS, promise };
  return promise;
}

export function formatBrlCents(value: number | null): string {
  return value === null ? 'INDISPONÍVEL' : `R$${(value / 100).toFixed(2)}`;
}

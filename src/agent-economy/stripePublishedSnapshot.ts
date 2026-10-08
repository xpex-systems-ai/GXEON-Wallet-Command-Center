/**
 * Shared, durable, provider-authoritative money-truth snapshot.
 *
 * Public dashboards read Firestore ONLY. An authenticated Vercel Cron refresh
 * performs Stripe LIVE reads and writes the last fully reconciled snapshot.
 * There is deliberately no public Stripe API polling or untrusted fallback.
 */
import { FirestoreRestClient, isFirestoreRestConfigured } from '../../api/_firestoreRest.js';
import {
  readStripeLiveMoneyTruth, type PublicStripeMoneyTruth,
} from './stripeLiveMoneyTruth.js';

const COLLECTION = 'financial_provider_snapshots';
const DOCUMENT = 'stripe_live_30day_charges';
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

export function unavailableStripeMoneyTruth(observedAt = new Date().toISOString()): PublicStripeMoneyTruth {
  return {
    status: 'UNAVAILABLE',
    observedAt,
    source: 'UNAVAILABLE',
    scope: 'CONNECTED_STRIPE_ACCOUNT_LAST_30_DAYS',
    windowStartUnix: null,
    windowEndUnix: null,
    maxPages: 5,
    pagesFetched: 0,
    exhaustive: false,
    paidCharges: null,
    grossBRLCents: null,
    refundedBRLCents: null,
    capturedMinusRefundedBRLCents: null,
    otherCurrencyPaidCharges: null,
    disputedCharges: null,
    note: 'Provider verification snapshot not available or stale (older than 36h). No public Stripe polling is permitted.',
  };
}

export function isFreshVerifiedSnapshot(value: unknown, now = Date.now()): value is PublicStripeMoneyTruth {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<PublicStripeMoneyTruth>;
  const sampledAt = typeof v.observedAt === 'string' ? Date.parse(v.observedAt) : NaN;
  const windowStart = v.windowStartUnix;
  const windowEnd = v.windowEndUnix;
  return v.status === 'PROVIDER_VERIFIED'
    && v.source === 'STRIPE_LIVE_CHARGES'
    && v.scope === 'CONNECTED_STRIPE_ACCOUNT_LAST_30_DAYS'
    && v.exhaustive === true
    && typeof windowStart === 'number' && Number.isSafeInteger(windowStart)
    && typeof windowEnd === 'number' && Number.isSafeInteger(windowEnd)
    && windowEnd >= windowStart
    && Number.isFinite(sampledAt)
    && sampledAt <= now && now - sampledAt < STALE_AFTER_MS
    && [v.paidCharges, v.grossBRLCents, v.refundedBRLCents, v.capturedMinusRefundedBRLCents,
      v.otherCurrencyPaidCharges, v.disputedCharges].every(n => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0);
}

export async function readPublishedStripeMoneyTruth(
  store?: Pick<FirestoreRestClient, 'get'>,
): Promise<PublicStripeMoneyTruth> {
  if (!isFirestoreRestConfigured() && !store) return unavailableStripeMoneyTruth();
  try {
    const client = store || new FirestoreRestClient();
    const value = (await client.get<PublicStripeMoneyTruth>(COLLECTION, DOCUMENT))?.data;
    return isFreshVerifiedSnapshot(value) ? value : unavailableStripeMoneyTruth();
  } catch {
    return unavailableStripeMoneyTruth();
  }
}

export async function refreshPublishedStripeMoneyTruth(
  store?: Pick<FirestoreRestClient, 'set'>,
  fetchProvider = readStripeLiveMoneyTruth,
): Promise<PublicStripeMoneyTruth> {
  // Only call behind CRON_SECRET-authenticated backend entrypoint.
  const result = await fetchProvider();
  if (!isFreshVerifiedSnapshot(result)) return result;
  const client = store || new FirestoreRestClient();
  await client.set(COLLECTION, DOCUMENT, result as unknown as Record<string, unknown>);
  return result;
}

/**
 * Shared, durable, provider-authoritative money-truth snapshot.
 *
 * Public dashboards read Firestore ONLY. An authenticated Vercel Cron refresh
 * performs Stripe LIVE reads and writes the last fully reconciled snapshot.
 * There is deliberately no public Stripe API polling or untrusted fallback.
 */
import { FirestoreRestClient, isFirestoreRestConfigured } from '../../api/_firestoreRest.js';
import { createHmac } from 'node:crypto';
import {
  readStripeLiveMoneyTruth, type PublicStripeMoneyTruth,
} from './stripeLiveMoneyTruth.js';

const COLLECTION = 'financial_provider_snapshots';
const DOCUMENT = 'stripe_live_30day_charges';
const STALE_AFTER_MS = 36 * 60 * 60 * 1000;

// The Stripe account's currently configured LIVE credential is bound to the
// snapshot, without ever storing or publishing the raw API key. A key change
// (including switching to another Stripe account) invalidates the prior record
// until a new authenticated cron refresh verifies this credential.
interface StoredStripeProof { snapshot: PublicStripeMoneyTruth; credentialBinding: string; }
export function stripeCredentialBinding(): string | null {
  const key = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '').trim();
  if (!/^(sk_live_|rk_live_)/.test(key)) return null;
  return createHmac('sha256', key).update('gxeon-money-truth-account-binding-v1').digest('hex');
}


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
  currentBinding = stripeCredentialBinding(),
): Promise<PublicStripeMoneyTruth> {
  // Missing/rotated Stripe credential: do not replay even a fresh snapshot.
  if (!currentBinding || (!isFirestoreRestConfigured() && !store)) {
    return unavailableStripeMoneyTruth();
  }
  try {
    const client = store || new FirestoreRestClient();
    const record = (await client.get<StoredStripeProof>(COLLECTION, DOCUMENT))?.data;
    if (!record || record.credentialBinding !== currentBinding) {
      return unavailableStripeMoneyTruth();
    }
    return isFreshVerifiedSnapshot(record.snapshot)
      ? record.snapshot : unavailableStripeMoneyTruth();
  } catch {
    return unavailableStripeMoneyTruth();
  }
}

export async function refreshPublishedStripeMoneyTruth(
  store?: Pick<FirestoreRestClient, 'set'>,
  fetchProvider = readStripeLiveMoneyTruth,
  currentBinding = stripeCredentialBinding(),
): Promise<PublicStripeMoneyTruth> {
  // Only call behind CRON_SECRET-authenticated backend entrypoint.
  if (!currentBinding) return unavailableStripeMoneyTruth();
  const result = await fetchProvider();
  if (!isFreshVerifiedSnapshot(result)) return result;
  const client = store || new FirestoreRestClient();
  const stored: StoredStripeProof = {
    snapshot: result, credentialBinding: currentBinding,
  };
  await client.set(COLLECTION, DOCUMENT, stored as unknown as Record<string, unknown>);
  // The credential binding remains server-only; return only public aggregate data.
  return result;
}

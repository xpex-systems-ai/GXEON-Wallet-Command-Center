import { ingestDemandSignal, RawDemandSignal } from '../demandRadar.js';
import { DemandOpportunity } from '../types.js';

export interface X402BazaarItem {
  id?: string;
  name?: string;
  title?: string;
  serviceName?: string;
  description?: string;
  resource?: string;
  url?: string;
  type?: string;
  price?: number;
  currency?: string;
  calls30d?: number;
  uniquePayers30d?: number;
  quality?: {
    l30DaysTotalCalls?: number;
    l30DaysUniquePayers?: number;
    lastCalledAt?: string;
  };
  accepts?: Array<{
    amount?: string | number;
    asset?: string;
    network?: string;
    payTo?: string;
  }>;
}

export interface FetchX402DemandOptions {
  query?: string;
  limit?: number;
  timeoutMs?: number;
}

let lastFetchTimestamp = 0;
let cachedOpportunities: DemandOpportunity[] = [];
const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Live connector to Coinbase Developer Platform x402 Bazaar Discovery API.
 * Ingests external machine agent capability listings as SUPPLY_LISTING or USAGE_SIGNAL.
 */
export async function fetchAndIngestX402Demand(
  options: FetchX402DemandOptions = {}
): Promise<DemandOpportunity[]> {
  const { query = 'verification', limit = 10, timeoutMs = 8000 } = options;

  // Rate/throttle protection: limit automatic background polls to once per hour unless forced
  const now = Date.now();
  if (now - lastFetchTimestamp < ONE_HOUR_MS && cachedOpportunities.length > 0) {
    return cachedOpportunities;
  }

  const endpoint = `https://api.cdp.coinbase.com/platform/v2/x402/discovery/search?query=${encodeURIComponent(
    query
  )}&limit=${limit}`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GXEON-Market-Radar/1.0',
      },
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok) {
      console.warn(`[X402_RADAR] Upstream returned status ${res.status}: ${res.statusText}`);
      return cachedOpportunities;
    }

    const data = (await res.json()) as {
      items?: X402BazaarItem[];
      results?: X402BazaarItem[];
      resources?: X402BazaarItem[];
    };
    const items = data.resources || data.items || data.results || [];

    const ingested: DemandOpportunity[] = [];

    for (const item of items) {
      const sourceUrl = item.resource || item.url || (item.id ? `https://cdp.coinbase.com/x402/${item.id}` : 'https://cdp.coinbase.com/x402');
      const title = item.serviceName || item.name || item.title || 'x402 Machine Agent Capability';
      const rawDescription = item.description || `Capability listing from x402 Bazaar: ${title}`;

      let statedPrice = item.price;
      let priceCurrency = item.currency || 'USD';
      if (item.accepts && item.accepts.length > 0 && item.accepts[0].amount !== undefined) {
        const rawAmt = Number(item.accepts[0].amount);
        if (!isNaN(rawAmt)) {
          statedPrice = rawAmt >= 100 ? rawAmt / 1_000_000 : rawAmt;
          priceCurrency = 'USDC';
        }
      }

      const calls30d = item.quality?.l30DaysTotalCalls ?? item.calls30d;
      const uniquePayers30d = item.quality?.l30DaysUniquePayers ?? item.uniquePayers30d;

      const rawSignal: RawDemandSignal = {
        source: 'x402_bazaar',
        sourceRecordId: item.id || `x402_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        sourceUrl,
        kind: calls30d !== undefined && calls30d > 0 ? 'USAGE_SIGNAL' : 'SUPPLY_LISTING',
        title,
        rawDescription,
        suggestedReward: null, // Dinheiro/recompensa desconhecido é null, nunca 25 por padrão
        statedPrice,
        priceCurrency,
        calls30d,
        uniquePayers30d,
        observedAt: new Date().toISOString(),
      };

      const opp = await ingestDemandSignal(rawSignal);
      ingested.push(opp);
    }

    lastFetchTimestamp = now;
    cachedOpportunities = ingested;
    return ingested;
  } catch (err: unknown) {
    clearTimeout(timer);
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[X402_RADAR] Failed to fetch live x402 listings: ${msg}`);
    return cachedOpportunities;
  }
}

export interface BazaarVisibilityResult {
  visibility: 'FOUND' | 'NOT_FOUND' | 'ERROR';
  payTo: string;
  facilitatorUrl: string;
  resourceCount: number;
  resources: any[];
  checkedAt: string;
  error?: string;
}

export const FORBIDDEN_EXAMPLE_ADDRESS = '0x209693bc6afc0c5328ba36faf03c514ef312287c'.toLowerCase();

/**
 * Checks if a specific payTo wallet address has visible registered resources on the official x402 Bazaar.
 * Requirement: BAZAAR_VISIBILITY=FOUND only when facilitator returns the GXEON resource.
 */
export async function checkBazaarVisibility(
  payToAddress: string,
  facilitatorUrl = process.env.GXEON_X402_FACILITATOR_URL || 'https://api.cdp.coinbase.com/platform/v2/x402'
): Promise<BazaarVisibilityResult> {
  const cleanPayTo = (payToAddress || '').trim().toLowerCase();
  const checkedAt = new Date().toISOString();

  if (!cleanPayTo || cleanPayTo === FORBIDDEN_EXAMPLE_ADDRESS) {
    return {
      visibility: 'NOT_FOUND',
      payTo: cleanPayTo,
      facilitatorUrl,
      resourceCount: 0,
      resources: [],
      checkedAt,
      error: 'Invalid or forbidden payTo address.',
    };
  }

  const endpoint = `${facilitatorUrl.replace(/\/$/, '')}/discovery/resources?payTo=${encodeURIComponent(cleanPayTo)}`;

  try {
    const res = await fetch(endpoint, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'GXEON-Market-Radar/1.0',
      },
    });

    if (!res.ok) {
      return {
        visibility: 'NOT_FOUND',
        payTo: cleanPayTo,
        facilitatorUrl,
        resourceCount: 0,
        resources: [],
        checkedAt,
        error: `Facilitator returned ${res.status}: ${res.statusText}`,
      };
    }

    const data = (await res.json()) as any;
    const items = data.resources || data.items || data.results || (Array.isArray(data) ? data : []);

    const found = items.filter((item: any) => {
      const hasPayTo =
        item.payTo?.toLowerCase() === cleanPayTo ||
        item.accepts?.some((acc: any) => acc.payTo?.toLowerCase() === cleanPayTo);
      return hasPayTo;
    });

    return {
      visibility: found.length > 0 ? 'FOUND' : 'NOT_FOUND',
      payTo: cleanPayTo,
      facilitatorUrl,
      resourceCount: found.length,
      resources: found,
      checkedAt,
    };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      visibility: 'ERROR',
      payTo: cleanPayTo,
      facilitatorUrl,
      resourceCount: 0,
      resources: [],
      checkedAt,
      error: msg,
    };
  }
}


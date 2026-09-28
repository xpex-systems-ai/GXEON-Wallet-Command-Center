import { ingestDemandSignal, RawDemandSignal } from '../demandRadar.js';
import { DemandOpportunity } from '../types.js';

export interface X402BazaarItem {
  id?: string;
  name?: string;
  title?: string;
  description?: string;
  resource?: string;
  url?: string;
  type?: string;
  price?: number;
  currency?: string;
  calls30d?: number;
  uniquePayers30d?: number;
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

    const data = (await res.json()) as { items?: X402BazaarItem[]; results?: X402BazaarItem[] };
    const items = data.items || data.results || [];

    const ingested: DemandOpportunity[] = [];

    for (const item of items) {
      const sourceUrl = item.resource || item.url || `https://cdp.coinbase.com/x402/${item.id || 'listing'}`;
      const title = item.name || item.title || 'x402 Machine Agent Capability';
      const rawDescription = item.description || `Capability listing from x402 Bazaar: ${title}`;

      const rawSignal: RawDemandSignal = {
        source: 'x402_bazaar',
        sourceRecordId: item.id || `x402_${Date.now()}`,
        sourceUrl,
        kind: item.calls30d !== undefined ? 'USAGE_SIGNAL' : 'SUPPLY_LISTING',
        title,
        rawDescription,
        suggestedReward: null, // Dinheiro/recompensa desconhecido é null, nunca 25 por padrão
        statedPrice: item.price,
        priceCurrency: item.currency || 'USD',
        calls30d: item.calls30d,
        uniquePayers30d: item.uniquePayers30d,
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

export const SPEEDBOT_OPPORTUNITIES_URL = 'https://speedbot.dev/api/opportunities';

export interface SpeedbotExternalOpportunity {
  id: string;
  source: string;
  title: string;
  status: string;
  rewardAmount: number | null;
  rewardCurrency: string;
  rewardNetwork: string | null;
  guaranteed: boolean | null;
  paymentModel: string | null;
  deadline: string | null;
  submissions: number | null;
  tags: string[];
  url: string;
  speedbotEscrow: boolean;
  agentEligibility: string | null;
  trust: string | null;
}

export interface SpeedbotExternalFeed {
  asOf: string;
  opportunities: SpeedbotExternalOpportunity[];
  accessTier: string | null;
  fullAccess: boolean;
  moneyTruth: string;
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('SPEEDBOT_MALFORMED_API');
  }
  return value as Record<string, unknown>;
}

function string(value: unknown, max = 1000): string {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    throw new Error('SPEEDBOT_MALFORMED_API');
  }
  return value;
}

function nullableString(value: unknown, max = 1000): string | null {
  return value == null ? null : string(value, max);
}

function nullableNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new Error('SPEEDBOT_MALFORMED_API');
  }
  return value;
}

function nullableBoolean(value: unknown): boolean | null {
  if (value == null) return null;
  if (typeof value !== 'boolean') throw new Error('SPEEDBOT_MALFORMED_API');
  return value;
}

function httpsUrl(value: unknown): string {
  const raw = string(value, 2000);
  const url = new URL(raw);
  if (url.protocol !== 'https:') throw new Error('SPEEDBOT_UNSAFE_URL');
  if (
    url.hostname === 'localhost' ||
    /^127\./.test(url.hostname) ||
    /^10\./.test(url.hostname) ||
    /^192\.168\./.test(url.hostname) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname)
  ) {
    throw new Error('SPEEDBOT_UNSAFE_URL');
  }
  return url.toString();
}

export function parseSpeedbotExternalFeed(value: unknown): SpeedbotExternalFeed {
  const root = object(value);
  const opportunities = Array.isArray(root.opportunities) ? root.opportunities : null;
  if (!opportunities) throw new Error('SPEEDBOT_MALFORMED_API');
  if (opportunities.length > 100) throw new Error('SPEEDBOT_RESPONSE_TOO_LARGE');

  const parsed = opportunities.map((raw): SpeedbotExternalOpportunity => {
    const item = object(raw);
    const reward = object(item.reward ?? {});
    const tags = Array.isArray(item.tags)
      ? item.tags.slice(0, 30).map(tag => string(tag, 80))
      : [];
    const status = string(item.status, 40);

    return {
      id: string(item.id, 300),
      source: string(item.source, 120),
      title: string(item.title, 1200),
      status,
      rewardAmount: nullableNumber(reward.amount),
      rewardCurrency: nullableString(reward.currency, 20) ?? 'UNKNOWN',
      rewardNetwork: nullableString(reward.network, 80),
      guaranteed: nullableBoolean(reward.guaranteed),
      paymentModel: nullableString(item.payment_model, 80),
      deadline: nullableString(item.deadline, 80),
      submissions:
        item.submissions == null
          ? null
          : Number.isSafeInteger(item.submissions) && Number(item.submissions) >= 0
            ? Number(item.submissions)
            : (() => { throw new Error('SPEEDBOT_MALFORMED_API'); })(),
      tags,
      url: httpsUrl(item.url),
      speedbotEscrow: item.speedbot_escrow === true,
      agentEligibility: nullableString(item.agent_eligibility, 80),
      trust: nullableString(item.trust, 800),
    };
  }).filter(item => item.status === 'open');

  const access =
    root.access && typeof root.access === 'object' && !Array.isArray(root.access)
      ? (root.access as Record<string, unknown>)
      : {};

  return {
    asOf: nullableString(root.as_of, 80) ?? new Date().toISOString(),
    opportunities: parsed,
    accessTier: nullableString(access.tier, 40),
    fullAccess: access.full_access === true,
    moneyTruth:
      'Speedbot external listings are leads, not GXEON revenue. External sources decide selection and settlement unless a later verified receipt proves payment.',
  };
}

/**
 * Public read-only Speedbot opportunity preview.
 * No authentication, cookies, payment headers, redirects or agent keys are sent.
 */
export async function fetchSpeedbotExternalOpportunities(
  fetcher: typeof fetch = fetch
): Promise<SpeedbotExternalFeed> {
  const response = await fetcher(SPEEDBOT_OPPORTUNITIES_URL, {
    method: 'GET',
    headers: { Accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(12_000),
  });

  if (!response.ok) {
    throw new Error(`SPEEDBOT_HTTP_${response.status}`);
  }

  const text = await response.text();
  if (text.length > 1_500_000) throw new Error('SPEEDBOT_RESPONSE_TOO_LARGE');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('SPEEDBOT_MALFORMED_JSON');
  }

  return parseSpeedbotExternalFeed(json);
}

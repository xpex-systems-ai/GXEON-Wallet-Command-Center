export interface ExternalPaidBounty {
  provider: 'rustchain' | 'algora';
  sourceUrl: string;
  sourceId: string;
  title: string;
  rewardAmount: number | null;
  rewardCurrency: string;
  payoutType: 'TOKEN' | 'FIAT_OR_STABLECOIN';
  status: 'OPEN';
  claimMethod: string | null;
  submitMethods: string[];
  cap: number | null;
  observedAt: string;
  moneyTruth: string;
}

type GitHubIssue = {
  number: number;
  html_url: string;
  title: string;
  body?: string | null;
  state?: string;
};

type AlgoraBounty = {
  id?: string | number;
  title?: string;
  url?: string;
  reward?: number;
  amount?: number;
  reward_usd?: number;
  currency?: string;
  status?: string;
};

function parseBountySpec(body: string): Record<string, string> | null {
  const match = body.match(/```bounty-spec\s*([\s\S]*?)```/i);
  if (!match) return null;
  const values: Record<string, string> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const cleaned = line.replace(/#.*$/, '').trim();
    if (!cleaned || !cleaned.includes(':')) continue;
    const idx = cleaned.indexOf(':');
    const key = cleaned.slice(0, idx).trim();
    const value = cleaned.slice(idx + 1).trim();
    if (key) values[key] = value;
  }
  return values;
}

function parseSubmitMethods(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .replace(/^\[/, '')
    .replace(/\]$/, '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function fetchRustChainPaidBounties(limit = 30): Promise<ExternalPaidBounty[]> {
  const query = 'repo:Scottcjn/rustchain-bounties is:issue is:open "bounty-spec"';
  const endpoint =
    'https://api.github.com/search/issues?q=' +
    encodeURIComponent(query) +
    '&sort=updated&order=desc&per_page=' +
    Math.min(Math.max(limit, 1), 50);

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GXEON-Paid-Bounty-Radar/1.0',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;

  const response = await fetch(endpoint, { headers });
  if (!response.ok) {
    throw new Error(`RUSTCHAIN_RADAR_HTTP_${response.status}: ${response.statusText}`);
  }

  const payload = (await response.json()) as { items?: GitHubIssue[] };
  const observedAt = new Date().toISOString();
  const results: ExternalPaidBounty[] = [];

  for (const issue of payload.items || []) {
    const body = issue.body || '';
    const spec = parseBountySpec(body);
    if (!spec || spec.paid?.toLowerCase() !== 'true') continue;

    const reward = Number(spec.reward_rtc);
    results.push({
      provider: 'rustchain',
      sourceUrl: issue.html_url,
      sourceId: `rustchain_bounty_${issue.number}`,
      title: issue.title,
      rewardAmount: Number.isFinite(reward) ? reward : null,
      rewardCurrency: 'RTC',
      payoutType: 'TOKEN',
      status: 'OPEN',
      claimMethod: 'Follow the issue-specific claim instructions',
      submitMethods: parseSubmitMethods(spec.submit),
      cap: Number.isFinite(Number(spec.cap)) ? Number(spec.cap) : null,
      observedAt,
      moneyTruth:
        'Provider marks this bounty paid in RTC. RTC is experimental and must not be treated as guaranteed fiat or stablecoin revenue.',
    });
  }

  return results;
}

export async function fetchAlgoraPaidBounties(limit = 50): Promise<ExternalPaidBounty[]> {
  const endpoint = `https://algora.io/api/bounties?status=open&limit=${Math.min(Math.max(limit, 1), 50)}`;
  const response = await fetch(endpoint, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'GXEON-Paid-Bounty-Radar/1.0',
    },
  });
  if (!response.ok) {
    throw new Error(`ALGORA_RADAR_HTTP_${response.status}: ${response.statusText}`);
  }

  const raw = await response.text();
  let items: AlgoraBounty[] = [];
  try {
    const parsed = JSON.parse(raw) as any;
    items = Array.isArray(parsed) ? parsed : parsed.bounties || parsed.items || parsed.results || [];
  } catch {
    // Algora currently may serve an HTML empty-state page from this public URL.
    // Empty means no verified open bounties; never invent records.
    return [];
  }

  const observedAt = new Date().toISOString();
  return items
    .filter((item) => !item.status || item.status.toLowerCase() === 'open')
    .map((item, index) => {
      const reward =
        item.reward_usd !== undefined
          ? Number(item.reward_usd)
          : item.reward !== undefined
            ? Number(item.reward)
            : item.amount !== undefined
              ? Number(item.amount)
              : NaN;
      return {
        provider: 'algora' as const,
        sourceUrl: item.url || 'https://algora.io/bounties',
        sourceId: `algora_${item.id ?? index}`,
        title: item.title || 'Algora open bounty',
        rewardAmount: Number.isFinite(reward) ? reward : null,
        rewardCurrency: item.currency || 'USD',
        payoutType: 'FIAT_OR_STABLECOIN' as const,
        status: 'OPEN' as const,
        claimMethod: 'Follow Algora/GitHub bounty claim instructions',
        submitMethods: ['github_pr'],
        cap: null,
        observedAt,
        moneyTruth:
          'Listing/reward is not revenue. Revenue exists only after authoritative payout settlement.',
      };
    });
}

export async function fetchPaidBountyRadar(): Promise<{
  providers: {
    rustchain: { ok: boolean; count: number; error?: string };
    algora: { ok: boolean; count: number; error?: string };
  };
  bounties: ExternalPaidBounty[];
}> {
  const [rustchain, algora] = await Promise.allSettled([
    fetchRustChainPaidBounties(),
    fetchAlgoraPaidBounties(),
  ]);

  const rustchainItems = rustchain.status === 'fulfilled' ? rustchain.value : [];
  const algoraItems = algora.status === 'fulfilled' ? algora.value : [];

  return {
    providers: {
      rustchain: {
        ok: rustchain.status === 'fulfilled',
        count: rustchainItems.length,
        ...(rustchain.status === 'rejected' ? { error: String(rustchain.reason) } : {}),
      },
      algora: {
        ok: algora.status === 'fulfilled',
        count: algoraItems.length,
        ...(algora.status === 'rejected' ? { error: String(algora.reason) } : {}),
      },
    },
    bounties: [...rustchainItems, ...algoraItems],
  };
}

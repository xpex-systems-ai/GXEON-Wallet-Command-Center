const MERGEPAY_BASE_URL = 'https://mergepay.codeswithroh.workers.dev';

type MergePayFeedItem = {
  kind: 'funded' | 'awarded' | 'paid' | 'linked' | 'refunded' | 'returned';
  ts: number;
  tx: string;
  repo?: string;
  issue?: number;
  amount?: string;
  user?: string;
  login?: string;
};

type MergePayFeed = {
  items?: MergePayFeedItem[];
  updated?: number;
  error?: string;
};

type MergePayBounty = {
  issue: number;
  amount: string;
  status: 'open' | 'awarded' | 'expired' | string;
  expiry: number;
};

type GithubRepo = {
  id: number;
  full_name: string;
  private?: boolean;
  archived?: boolean;
};

type GithubIssue = {
  number: number;
  state: 'open' | 'closed' | string;
  html_url: string;
  title: string;
  assignee?: { login?: string } | null;
  assignees?: Array<{ login?: string }>;
  pull_request?: unknown;
};

const DEFAULT_REPOS = ['codeswithroh/mergepay', 'codeswithroh/tastemaker'];

function githubHeaders(): Record<string, string> {
  const token = process.env.GITHUB_TOKEN?.trim();
  return {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'GXEON-MergePay-Radar/1.0',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchJson(url: string, init: RequestInit = {}): Promise<any> {
  const response = await fetch(url, init);
  const raw = await response.text();
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : null;
  } catch {
    throw new Error(`MERGEPAY_PROTOCOL_ERROR: HTTP ${response.status} returned non-JSON payload`);
  }
  if (!response.ok) {
    const message = body?.message || body?.error || raw.slice(0, 240) || response.statusText;
    throw new Error(`MERGEPAY_HTTP_${response.status}: ${message}`);
  }
  return body;
}

export function getMergePayIntegrationStatus() {
  return {
    provider: 'MergePay',
    website: MERGEPAY_BASE_URL,
    network: 'Arc mainnet',
    chainId: 5042,
    currency: 'USDC',
    contract: '0xcff79B144833b36ca53b310C1Ad7854AF9Ff9EeD',
    mode: 'github_issue_bounty_to_merged_pr_payout',
    discovery: 'public_onchain_index_plus_github',
    writeEnabled: false,
    claimMode: 'GitHub /claim comment; execution requires repository contribution workflow',
    walletLinkRequiredForDirectPayout: true,
    moneyTruth: 'Only confirmed MergePay/Arc payout counts as revenue.',
  };
}

export async function getMergePayFeed(): Promise<MergePayFeed> {
  return fetchJson(`${MERGEPAY_BASE_URL}/api/feed`, {
    headers: { Accept: 'application/json' },
  });
}

async function getGithubRepo(fullName: string): Promise<GithubRepo> {
  return fetchJson(`https://api.github.com/repos/${fullName}`, {
    headers: githubHeaders(),
  });
}

async function getGithubIssue(fullName: string, issue: number): Promise<GithubIssue> {
  return fetchJson(`https://api.github.com/repos/${fullName}/issues/${issue}`, {
    headers: githubHeaders(),
  });
}

async function getRepoBounties(repoId: number): Promise<MergePayBounty[]> {
  const response = await fetchJson(
    `${MERGEPAY_BASE_URL}/api/bounties?repo=${encodeURIComponent(String(repoId))}`,
    { headers: { Accept: 'application/json' } }
  );
  return Array.isArray(response?.bounties) ? response.bounties : [];
}

export async function listMergePayOpenBounties(options?: {
  maxRepos?: number;
  includeClaimed?: boolean;
}) {
  const feed = await getMergePayFeed();
  const feedRepos = (feed.items || [])
    .map((item) => item.repo)
    .filter((repo): repo is string => Boolean(repo && repo.includes('/')));

  const repos = Array.from(new Set([...DEFAULT_REPOS, ...feedRepos])).slice(
    0,
    Math.max(1, Math.min(options?.maxRepos || 20, 40))
  );

  const results: any[] = [];
  const errors: Array<{ repo: string; error: string }> = [];

  for (const repo of repos) {
    try {
      const meta = await getGithubRepo(repo);
      if (meta.private || meta.archived) continue;

      const bounties = await getRepoBounties(meta.id);
      for (const bounty of bounties) {
        if (bounty.status !== 'open') continue;

        let issue: GithubIssue | null = null;
        try {
          issue = await getGithubIssue(repo, bounty.issue);
        } catch (error: any) {
          errors.push({ repo, error: `issue #${bounty.issue}: ${String(error?.message || error)}` });
        }

        const claimedBy =
          issue?.assignee?.login ||
          issue?.assignees?.find((a) => a?.login)?.login ||
          null;
        const claimAvailable = issue?.state === 'open' && !claimedBy;

        if (!options?.includeClaimed && !claimAvailable) continue;

        results.push({
          provider: 'MergePay',
          repo,
          repoId: meta.id,
          issue: bounty.issue,
          title: issue?.title || `Issue #${bounty.issue}`,
          issueUrl: issue?.html_url || `https://github.com/${repo}/issues/${bounty.issue}`,
          amountUsdc: Number(bounty.amount),
          currency: 'USDC',
          network: 'Arc',
          chainId: 5042,
          status: bounty.status,
          expiryUnix: bounty.expiry,
          expiryIso: new Date(bounty.expiry * 1000).toISOString(),
          claimedBy,
          claimAvailable,
          payoutCondition: 'Merged PR from current claimant that closes the funded issue',
          claimAction: 'Comment /claim on the GitHub issue',
          moneyTruth: 'Bounty amount is escrowed on MergePay; revenue is counted only after confirmed payout.',
        });
      }
    } catch (error: any) {
      errors.push({ repo, error: String(error?.message || error) });
    }
  }

  results.sort((a, b) => b.amountUsdc - a.amountUsdc);

  return {
    provider: 'MergePay',
    checkedAt: new Date().toISOString(),
    reposScanned: repos.length,
    openUnclaimed: results.length,
    bounties: results,
    errors,
    feedUpdated: feed.updated || null,
  };
}

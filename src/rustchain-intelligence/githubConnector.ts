import type { ContributionRecord } from './types.js';

const API = 'https://api.github.com';
const ALLOWED_REPO = 'Scottcjn/rustchain-bounties';

export async function fetchIssueEvidence(issue: number, claimant: string, wallet: string): Promise<ContributionRecord> {
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('INVALID_ISSUE');
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'GXEON-RustChain-Intelligence/1.0' };
  const [issueResponse, commentsResponse] = await Promise.all([
    fetch(`${API}/repos/${ALLOWED_REPO}/issues/${issue}`, { headers, redirect: 'error' }),
    fetch(`${API}/repos/${ALLOWED_REPO}/issues/${issue}/comments?per_page=100`, { headers, redirect: 'error' }),
  ]);
  if (!issueResponse.ok || !commentsResponse.ok) throw new Error(`GITHUB_READ_FAILED:${issueResponse.status}:${commentsResponse.status}`);
  const issueBody = await issueResponse.json() as { title?: string; body?: string };
  const comments = await commentsResponse.json() as Array<{ html_url?: string; body?: string; user?: { login?: string } }>;
  const evidence = comments
    .filter((c) => c.user?.login === 'Scottcjn' || c.user?.login === 'sophiaeagent-beep')
    .map((c) => ({ source: 'github' as const, url: c.html_url, authority: c.user?.login }));
  return { issue, title: issueBody.title || `Issue #${issue}`, repository: ALLOWED_REPO, claimant, wallet,
    rewardRtc: null, state: comments.some((c) => c.user?.login === claimant) ? 'SUBMITTED' : 'OPPORTUNITY', evidence };
}

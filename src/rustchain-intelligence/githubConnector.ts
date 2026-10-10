import type { ContributionRecord } from './types.js';

const API = 'https://api.github.com';
const ALLOWED_REPO = 'Scottcjn/rustchain-bounties';

type Comment = { html_url?: string; body?: string; user?: { login?: string } };

/** Read every comment page, including issues with over 100 comments. */
export async function fetchAllIssueComments(issue: number, headers: Record<string, string>): Promise<Comment[]> {
  const comments: Comment[] = [];
  for (let page = 1; page <= 100; page++) {
    const url = `${API}/repos/${ALLOWED_REPO}/issues/${issue}/comments?per_page=100&page=${page}`;
    const response = await fetch(url, { headers, redirect: 'error' });
    if (!response.ok) throw new Error(`GITHUB_COMMENTS_READ_FAILED:${response.status}:page=${page}`);
    const batch = await response.json() as Comment[];
    if (!Array.isArray(batch)) throw new Error('GITHUB_COMMENTS_INVALID_RESPONSE');
    comments.push(...batch);
    if (batch.length < 100) return comments;
  }
  throw new Error('GITHUB_COMMENTS_PAGE_LIMIT_REACHED');
}

export async function fetchIssueEvidence(issue: number, claimant: string, wallet: string): Promise<ContributionRecord> {
  if (!Number.isInteger(issue) || issue <= 0) throw new Error('INVALID_ISSUE');
  const headers: Record<string, string> = { Accept: 'application/vnd.github+json', 'User-Agent': 'GXEON-RustChain-Intelligence/1.0' };
  const [issueResponse, comments] = await Promise.all([
    fetch(`${API}/repos/${ALLOWED_REPO}/issues/${issue}`, { headers, redirect: 'error' }),
    fetchAllIssueComments(issue, headers),
  ]);
  if (!issueResponse.ok) throw new Error(`GITHUB_ISSUE_READ_FAILED:${issueResponse.status}`);
  const issueBody = await issueResponse.json() as { title?: string; body?: string };
  const evidence = comments
    .filter((c) => c.user?.login === 'Scottcjn' || c.user?.login === 'sophiaeagent-beep')
    .map((c) => ({ source: 'github' as const, url: c.html_url, authority: c.user?.login }));
  return { issue, title: issueBody.title || `Issue #${issue}`, repository: ALLOWED_REPO, claimant, wallet,
    rewardRtc: null, state: comments.some((c) => c.user?.login === claimant) ? 'SUBMITTED' : 'OPPORTUNITY', evidence };
}

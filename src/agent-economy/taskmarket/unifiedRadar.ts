import { FirestoreRestClient } from '../../../api/_firestoreRest.js';
import { callBountyTool, getBountyIntegrationStatus } from '../connectors/bountyMcpConnector.js';
import { listMergePayOpenBounties } from '../connectors/mergePayConnector.js';
import { fetchPaidBountyRadar } from '../connectors/paidBountyConnector.js';
import type { TaskmarketSnapshot } from './types.js';

export interface UnifiedPaidOpportunity {
  provider: string; externalId: string; title: string; url: string; reward: number | null; currency: string;
  fundingStatus: 'ONCHAIN_VERIFIED' | 'PROVIDER_REPORTED' | 'UNKNOWN';
  claimStatus: 'AVAILABLE' | 'CLAIMED_OR_CONFLICT' | 'UNKNOWN';
  fitScore: number | null; riskScore: number | null; competition: number | null; deadline: string | null;
  estimatedEffort: number | null; expectedValue: number | null; recommendedAction: string; evidence: Record<string, unknown>;
}

export async function refreshUnifiedPaidRadar(taskmarket: TaskmarketSnapshot) {
  const providers: Record<string, { ok: boolean; count: number | null; error?: string }> = {
    taskmarket: { ok: taskmarket.apiReachable && taskmarket.errors.length === 0, count: taskmarket.openTasks },
  };
  const opportunities: UnifiedPaidOpportunity[] = taskmarket.opportunities.map(o => ({
    provider: 'taskmarket', externalId: o.taskId, title: o.title, url: o.url, reward: o.rewardUsdc, currency: 'USDC',
    fundingStatus: o.fundingStatus === 'ONCHAIN_VERIFIED' ? 'ONCHAIN_VERIFIED' : 'PROVIDER_REPORTED',
    claimStatus: o.state === 'CLAIM_READY' ? 'AVAILABLE' : o.claimed ? 'CLAIMED_OR_CONFLICT' : 'UNKNOWN',
    fitScore: o.fitScore, riskScore: o.riskScore, competition: o.competition, deadline: o.deadline,
    estimatedEffort: o.expectedEffortMinutes, expectedValue: null, recommendedAction: o.recommendedAction, evidence: { ...o.sourceEvidence },
  }));
  const results = await Promise.allSettled([
    getBountyIntegrationStatus().configured ? callBountyTool('bounty_list_open', {}) : Promise.reject(new Error('UNCONFIGURED')),
    listMergePayOpenBounties({ maxRepos: 20, includeClaimed: true }), fetchPaidBountyRadar(),
  ]);
  const [bounty, mergepay, github] = results;
  if (bounty.status === 'fulfilled') {
    const data = bounty.value as { bounties?: unknown[]; is_done?: boolean };
    if (!Array.isArray(data.bounties)) providers.bounty = { ok: false, count: null, error: 'UNRECOGNIZED_SCHEMA' };
    else {
      providers.bounty = { ok: data.is_done === true, count: data.bounties.length, ...(data.is_done !== true ? { error: 'MORE_PAGES_REQUIRE_REVIEW' } : {}) };
      // No reward/unit assumptions for a provider record that has not yet been independently qualified.
      for (const raw of data.bounties) {
        if (!raw || typeof raw !== 'object') continue;
        const item = raw as Record<string, unknown>;
        const id = typeof item.id === 'string' ? item.id : typeof item.bounty_id === 'string' ? item.bounty_id : null;
        if (!id) { providers.bounty.error = 'UNRECOGNIZED_RECORD_SCHEMA'; continue; }
        opportunities.push({ provider: 'bounty', externalId: id, title: typeof item.title === 'string' ? item.title : `Bounty ${id}`,
          url: 'https://trybounty.ai/agents', reward: null, currency: 'UNKNOWN', fundingStatus: 'UNKNOWN', claimStatus: 'UNKNOWN',
          fitScore: null, riskScore: null, competition: null, deadline: null, estimatedEffort: null, expectedValue: null,
          recommendedAction: 'FETCH_CANONICAL_TERMS_AND_REWARD', evidence: { readTool: 'bounty_get', bountyId: id } });
      }
    }
  } else providers.bounty = { ok: false, count: null, error: 'READ_UNAVAILABLE_OR_UNCONFIGURED' };
  if (mergepay.status === 'fulfilled') {
    providers.mergepay = { ok: mergepay.value.errors.length === 0, count: mergepay.value.bounties.length };
    for (const b of mergepay.value.bounties) opportunities.push({
      provider: 'mergepay', externalId: `${b.repo}#${b.issue}`, title: b.title, url: b.issueUrl, reward: b.amountUsdc, currency: 'USDC',
      fundingStatus: 'PROVIDER_REPORTED', claimStatus: b.claimStatus, fitScore: null, riskScore: null, competition: b.claimedBy ? 1 : null,
      deadline: b.expiryIso, estimatedEffort: null, expectedValue: null, recommendedAction: b.claimAvailable ? 'REVIEW_SCOPE_AND_CONTRACT' : 'WAIT_CLAIM_RESOLUTION',
      evidence: { claimEvidence: b.claimEvidence, payoutCondition: b.payoutCondition },
    });
  } else providers.mergepay = { ok: false, count: null, error: 'READ_UNAVAILABLE' };
  if (github.status === 'fulfilled') {
    for (const [provider, status] of Object.entries(github.value.providers)) providers[provider] = { ok: status.ok, count: status.count, ...(!status.ok ? { error: 'READ_UNAVAILABLE' } : {}) };
    for (const b of github.value.bounties) opportunities.push({ provider: b.provider, externalId: b.sourceId, title: b.title,
      url: b.sourceUrl, reward: b.rewardAmount, currency: b.rewardCurrency, fundingStatus: 'UNKNOWN', claimStatus: 'UNKNOWN',
      fitScore: null, riskScore: null, competition: null, deadline: null, estimatedEffort: null, expectedValue: null,
      recommendedAction: 'VERIFY_FUNDING_CLAIM_AND_PAYOUT', evidence: { observedAt: b.observedAt, payoutType: b.payoutType } });
  } else providers.github_paid_issues = { ok: false, count: null, error: 'READ_UNAVAILABLE' };
  const unique = [...new Map(opportunities.map(o => [`${o.provider}:${o.externalId}`, o])).values()];
  unique.sort((a, b) => Number(b.fundingStatus === 'ONCHAIN_VERIFIED') - Number(a.fundingStatus === 'ONCHAIN_VERIFIED') ||
    Number(b.claimStatus === 'AVAILABLE') - Number(a.claimStatus === 'AVAILABLE') || (b.fitScore ?? -1) - (a.fitScore ?? -1) || (a.riskScore ?? 101) - (b.riskScore ?? 101));
  const snapshot = { fetchedAt: new Date().toISOString(), providers, opportunities: unique, moneyTruth: 'Listed rewards and escrow are not revenue.' };
  await new FirestoreRestClient().set('marketplace_agent_state', 'unified', snapshot);
  return snapshot;
}

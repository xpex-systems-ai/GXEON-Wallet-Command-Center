import { sourceHash, TASKMARKET_API, taskmarketWritesEnabled, usdc } from '../connectors/taskmarketConnector.js';
import type { ActionPreview, FundingEvidence, LegalBundle, QualificationAssessment, RequesterStats, TaskmarketAction, TaskmarketOpportunity, TaskmarketTask, WorkerStatus } from './types.js';

export function qualifyTask(task: TaskmarketTask, context: {
  funding: FundingEvidence; legal: LegalBundle; requester: RequesterStats | null; identity: WorkerStatus;
  assessment?: QualificationAssessment | null; now?: number;
}): TaskmarketOpportunity {
  const now = context.now ?? Date.now(); const reasons: string[] = []; const blockers: string[] = [];
  const reward = usdc(task.reward); const net = task.netReward == null ? null : usdc(task.netReward);
  const hash = sourceHash(task);
  const a = context.assessment?.sourceHash === hash ? context.assessment : null;
  const workerActions = task.pendingActions.filter(p => p.role === 'worker');
  const action = workerActions.find(p => ['claim', 'pitch', 'bid', 'submit', 'submit_proof', 'auction_accept'].includes(p.action));
  const providerSpend = action?.requiresPayment === false ? 0 : action?.paymentAmount ? usdc(action.paymentAmount) : null;
  const external = providerSpend === null ? null : Math.max(providerSpend, a?.externalSpendUsdc ?? 0);
  const competition = Math.max(task.submissionCount, task.pitchCount, task.auctionBidCount || 0);
  let risk = 0;
  if (task.status !== 'open' || (['bounty', 'benchmark'].includes(task.mode) && !task.submissionWindowOpen)) reasons.push('TASK_NOT_OPEN');
  if (Date.parse(task.expiryTime) <= now) reasons.push('TASK_EXPIRED');
  if (!context.funding.verified) { blockers.push('FUNDING_NOT_VERIFIED'); risk += 40; }
  if (reward <= 0 || net === 0) reasons.push('ZERO_REWARD');
  if (net === null || net > reward) { blockers.push('NET_REWARD_UNVERIFIED'); risk += 20; }
  if (task.claimedBy) reasons.push('ALREADY_CLAIMED');
  if (task.stakeRequired) { blockers.push('BOND_APPROVAL_REQUIRED'); risk += 30; }
  if (external === null) { blockers.push('EXTERNAL_SPEND_UNKNOWN'); risk += 20; }
  else if (external > 0) blockers.push('SPEND_APPROVAL_REQUIRED');
  if (!context.requester) { blockers.push('REQUESTER_UNVERIFIED'); risk += 30; }
  else {
    const r = context.requester;
    const bad = r.cancelledAfterSubmissionsCount + r.expiredNoActionCount + r.expiredAfterRejectionsCount;
    if (bad > 0 && bad / Math.max(1, r.totalTasksCreated) > 0.3) { reasons.push('POOR_REQUESTER_HISTORY'); risk += 40; }
    if (r.completedCount - r.selfAwardCount === 0) { blockers.push('NO_INDEPENDENT_REQUESTER_PAYOUT_HISTORY'); risk += 20; }
  }
  // This is a workload policy, not a fabricated acceptance probability.
  if (competition >= 20 && reward <= 30) { reasons.push('COMPETITION_TOO_HIGH_FOR_REWARD'); risk += 35; }
  if (!a) { blockers.push('SCOPE_AND_COST_REVIEW_REQUIRED'); risk += 20; }
  else {
    if (!a.scopeVerified || !a.criteriaVerified || !a.safeContentVerified) reasons.push('SCOPE_OR_SAFETY_NOT_VERIFIED');
    if (task.hooks.length && !a.hooksReviewed) blockers.push('CONTRACT_HOOK_REVIEW_REQUIRED');
    if (![a.estimatedMinutes, a.estimatedExecutionCostUsdc, a.externalSpendUsdc].every(Number.isFinite) || a.estimatedMinutes <= 0 || a.estimatedExecutionCostUsdc < 0 || a.externalSpendUsdc < 0) reasons.push('INVALID_ECONOMIC_ASSESSMENT');
    if (a.estimatedMinutes * 60000 >= Date.parse(task.expiryTime) - now) reasons.push('DEADLINE_IMPOSSIBLE');
    if (net !== null && external !== null && external + a.estimatedExecutionCostUsdc >= net) reasons.push('COST_EXCEEDS_REWARD');
  }
  // No keyword match can authorize work. Only scoped review against a implemented runner can.
  const supported = Boolean(a && ['gxeon_json_validate_v1', 'gxeon_url_verify_v1'].includes(a.capability));
  const fit = supported && a?.scopeVerified ? 90 : 0;
  if (fit < 80) reasons.push('NO_VERIFIED_EXECUTION_CAPABILITY');
  risk = Math.min(100, risk);
  if (risk > 30) reasons.push('RISK_ABOVE_30');
  if (context.legal.enforcementEnabled) blockers.push('LEGAL_ACCEPTANCE_REQUIRED');
  if (context.identity.registered !== true || context.identity.cacheFresh === false) blockers.push('WORKER_IDENTITY_REQUIRED');
  if (!action) blockers.push('NO_WORKER_ACTION_AVAILABLE');
  const qualified = reasons.length === 0 && !blockers.some(b => !['WORKER_IDENTITY_REQUIRED', 'LEGAL_ACCEPTANCE_REQUIRED', 'SPEND_APPROVAL_REQUIRED', 'BOND_APPROVAL_REQUIRED'].includes(b));
  const state = reasons.includes('TASK_EXPIRED') ? 'EXPIRED' : reasons.length ? 'REJECTED' : qualified && blockers.length === 0 ? 'CLAIM_READY' : qualified ? 'QUALIFIED' : 'DISCOVERED';
  return {
    provider: 'taskmarket', externalId: task.id, taskId: task.id, title: task.description.split('\n')[0].replace(/^#+\s*/, '').slice(0, 150),
    description: task.description, url: `https://taskmarket.dev/tasks/${task.id}`, requester: task.requester,
    rewardUsdc: reward, netRewardUsdc: net, taskMode: task.mode, status: task.status, state, deadline: task.expiryTime,
    submissionRequirements: a?.submissionRequirements || null, requesterReputation: context.requester, claimed: Boolean(task.claimedBy), competition,
    requiresSpend: external === null ? null : external > 0, requiresBond: task.stakeRequired, requiresWalletSignature: true,
    fitScore: fit, riskScore: risk, expectedEffortMinutes: a?.estimatedMinutes ?? null, externalSpendUsdc: external,
    estimatedExecutionCostUsdc: a?.estimatedExecutionCostUsdc ?? null, probabilityOfAcceptance: null, expectedValue: null,
    expectedNetUsdc: null, expectedNetPerHour: null,
    maximumNetIfAcceptedUsdc: a && net !== null && external !== null ? net - external - a.estimatedExecutionCostUsdc : null,
    capabilitiesMatched: supported && a ? [a.capability] : [], rejectionReasons: reasons, blockers,
    recommendedAction: state === 'CLAIM_READY' ? 'PREPARE_ACTION_FOR_APPROVAL' : state === 'REJECTED' || state === 'EXPIRED' ? 'SKIP' : 'REVIEW',
    fundingStatus: context.funding.status, sourceEvidence: { apiUrl: `${TASKMARKET_API}/api/tasks/${task.id}`, sourceHash: hash,
      escrow: context.funding, legalDigest: context.legal.bundleDigest }, fetchedAt: new Date(now).toISOString(),
  };
}

export function previewAction(task: TaskmarketTask, action: TaskmarketAction, opportunity: TaskmarketOpportunity, worker: string | null, now = Date.now()): ActionPreview {
  const pending = task.pendingActions.find(p => p.role === 'worker' && p.action === action);
  const reasons = [...opportunity.rejectionReasons, ...opportunity.blockers];
  const available = Boolean(pending && (!pending.eligibleAddress || worker?.toLowerCase() === pending.eligibleAddress.toLowerCase()) &&
    (!pending.availableAfter || Date.parse(pending.availableAfter) <= now) && (!pending.availableUntil || Date.parse(pending.availableUntil) > now) &&
    Date.parse(task.expiryTime) > now);
  if (!available) reasons.push('ACTION_NOT_AVAILABLE_FOR_WORKER');
  if (!taskmarketWritesEnabled()) reasons.push('WRITES_DISABLED');
  reasons.push('HUMAN_SIGNATURE_APPROVAL_REQUIRED', 'USE_OFFICIAL_LOCAL_CLI');
  const amount = pending?.requiresPayment === false ? 0 : pending?.paymentAmount ? usdc(pending.paymentAmount) : null;
  return { taskId: task.id, action, reward: opportunity.rewardUsdc, externalSpend: amount,
    bondUsdc: task.stakeRequired ? usdc((BigInt(task.reward) * BigInt(task.stakeBps) / 10000n).toString()) : 0,
    walletSignatureRequired: true, irreversible: true, approvalRequired: true, writeEnabled: taskmarketWritesEnabled(), actionAvailable: available,
    executable: false, reason: [...new Set(reasons)],
    commandPreview: available ? `taskmarket task ${action} ${task.id}${action === 'submit' ? ' --file <reviewed-artifact-path>' : ''}` : null };
}

export function rankOpportunities(items: TaskmarketOpportunity[]): TaskmarketOpportunity[] {
  return [...items].sort((a, b) => Number(b.fundingStatus === 'ONCHAIN_VERIFIED') - Number(a.fundingStatus === 'ONCHAIN_VERIFIED') ||
    Number(b.state === 'CLAIM_READY') - Number(a.state === 'CLAIM_READY') || b.fitScore - a.fitScore || a.riskScore - b.riskScore ||
    a.competition - b.competition || Number(a.requiresSpend !== false) - Number(b.requiresSpend !== false) ||
    (a.expectedEffortMinutes ?? Infinity) - (b.expectedEffortMinutes ?? Infinity));
}

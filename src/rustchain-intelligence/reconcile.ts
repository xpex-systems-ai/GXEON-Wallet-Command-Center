import type { ContributionRecord, ContributionState, ContributionSummary, RustChainEvidence } from './types.js';

const AUTHORIZED = new Set(['Scottcjn', 'sophiaeagent-beep']);
const RUSTCHAIN_WALLET_API = 'https://rustchain.org/wallet/history';

// Only this module can mint a trusted receipt, after fetching the official wallet.
// A caller-provided { source: 'ledger', confirmed: true } is NOT a receipt.
type VerifiedReceipt = { wallet: string; issue: number; claimant: string; txHash: string; amountRtc: number };
const verifiedReceipts = new WeakMap<ContributionRecord, VerifiedReceipt>();

function authorizedGitHubEvidence(evidence: RustChainEvidence[]): RustChainEvidence[] {
  return evidence.filter((e) => e.source === 'github' && e.authority && AUTHORIZED.has(e.authority));
}

function hasVerifiedReceipt(record: ContributionRecord): VerifiedReceipt | null {
  const proof = verifiedReceipts.get(record);
  if (!proof || record.wallet !== proof.wallet || record.issue !== proof.issue ||
      record.claimant !== proof.claimant || record.rewardRtc !== proof.amountRtc ||
      !record.evidence.some((e) => e.source === 'ledger' && e.confirmed === true &&
        e.txHash === proof.txHash && e.amountRtc === proof.amountRtc)) return null;
  return proof;
}

function deriveState(record: ContributionRecord): ContributionState {
  if (hasVerifiedReceipt(record)) return 'CONFIRMED';
  const evidence = authorizedGitHubEvidence(record.evidence);
  if (evidence.some((e) => e.pendingId && e.txHash && e.amountRtc != null)) return 'PENDING';
  if (evidence.some((e) => e.amountRtc != null)) return 'ACCEPTED';
  return record.state === 'SUBMITTED' ? 'SUBMITTED' : 'OPPORTUNITY';
}

export function reconcileContribution(input: ContributionRecord): ContributionRecord {
  const state = deriveState(input);
  const record = { ...input, state };
  const verified = hasVerifiedReceipt(input);
  if (verified && state === 'CONFIRMED') verifiedReceipts.set(record, verified);
  return record;
}

type WalletTransfer = {
  type?: string; status?: string; tx_hash?: string | null;
  amount?: number; memo?: string;
};

function transferMatches(record: ContributionRecord, claim: RustChainEvidence, tx: WalletTransfer): boolean {
  if (tx.type !== 'transfer_in' || tx.status !== 'confirmed' ||
      typeof tx.tx_hash !== 'string' || tx.tx_hash !== claim.txHash ||
      typeof tx.memo !== 'string' || !tx.memo.toLowerCase().includes(record.claimant.toLowerCase())) return false;
  // A hash from a DIFFERENT award cannot be reused, even if the same wallet was paid.
  const awardTag = new RegExp('(^|[^0-9])#' + record.issue + '(?![0-9])');
  return awardTag.test(tx.memo) && Number.isFinite(tx.amount) &&
    Math.round((tx.amount ?? 0) * 1e6) === Math.round((claim.amountRtc ?? -1) * 1e6) &&
    Math.round((tx.amount ?? 0) * 1e6) === Math.round((record.rewardRtc ?? -1) * 1e6);
}

/**
 * Verify claimed payout against RustChain's official HTTPS wallet-scoped transfer history.
 * No wallet signing, transfers, credentials, fabricated ledger status or write operations.
 * Network/format failure throws: callers must display UNAVAILABLE, never CONFIRMED.
 */
export async function reconcileContributionWithOfficialWallet(input: ContributionRecord): Promise<ContributionRecord> {
  const claims = input.evidence.filter((e) => e.source === 'ledger' && e.confirmed === true &&
    typeof e.txHash === 'string' && /^[0-9a-f]{32,64}$/i.test(e.txHash) &&
    typeof e.amountRtc === 'number' && Number.isFinite(e.amountRtc) && e.amountRtc > 0);
  if (claims.length === 0) return reconcileContribution(input);
  if (!input.wallet || !input.claimant || !Number.isInteger(input.issue) || input.issue <= 0 ||
      input.rewardRtc == null || !Number.isFinite(input.rewardRtc) || input.rewardRtc <= 0) {
    throw new Error('RUSTCHAIN_IDENTITY_OR_AMOUNT_INVALID');
  }

  const url = RUSTCHAIN_WALLET_API + '?miner_id=' + encodeURIComponent(input.wallet) + '&limit=100';
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: 'application/json' },
      redirect: 'error',
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new Error('RUSTCHAIN_WALLET_HISTORY_UNAVAILABLE');
  }
  if (!response.ok) throw new Error('RUSTCHAIN_WALLET_HISTORY_UNAVAILABLE');
  const history = await response.json() as {
    ok?: boolean; miner_id?: string; transactions?: WalletTransfer[];
  };
  if (history.ok !== true || history.miner_id !== input.wallet || !Array.isArray(history.transactions)) {
    throw new Error('RUSTCHAIN_WALLET_HISTORY_INVALID');
  }

  for (const claim of claims) {
    const matching = history.transactions.find((tx) => transferMatches(input, claim, tx));
    if (!matching) continue;
    const trusted: VerifiedReceipt = {
      wallet: input.wallet, issue: input.issue, claimant: input.claimant,
      txHash: matching.tx_hash!, amountRtc: input.rewardRtc,
    };
    const observed = {
      ...input,
      evidence: [...input.evidence, {
        source: 'ledger' as const, txHash: trusted.txHash, amountRtc: trusted.amountRtc,
        confirmed: true, url,
      }],
    };
    verifiedReceipts.set(observed, trusted);
    return reconcileContribution(observed);
  }
  // A caller-supplied hash that does not match this wallet and award never promotes status.
  return reconcileContribution(input);
}

export function summarizeContributions(input: ContributionRecord[]): ContributionSummary {
  const records = input.map(reconcileContribution);
  const totals = { opportunityRtc: 0, submittedRtc: 0, acceptedRtc: 0, pendingRtc: 0, confirmedRtc: 0 };
  const countedTxHashes = new Set<string>();
  for (const item of records) {
    const amount = item.rewardRtc ?? 0;
    if (item.state === 'CONFIRMED') {
      const verified = hasVerifiedReceipt(item);
      if (verified) {
        // A real payout cannot be counted twice when the same evidence appears in two records.
        const id = verified.wallet + ':' + verified.txHash.toLowerCase();
        if (!countedTxHashes.has(id)) {
          countedTxHashes.add(id);
          totals.confirmedRtc += amount;
        }
      }
    } else if (item.state === 'OPPORTUNITY') totals.opportunityRtc += amount;
    else if (item.state === 'SUBMITTED') totals.submittedRtc += amount;
    else if (item.state === 'ACCEPTED') totals.acceptedRtc += amount;
    else if (item.state === 'PENDING') totals.pendingRtc += amount;
  }
  return { ...totals, records };
}

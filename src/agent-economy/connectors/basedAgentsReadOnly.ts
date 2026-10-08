/**
 * Read-only BasedAgents public API integration for GXEON.
 * Public board entries are NOT invitations addressed to our agent.
 * No task claiming, posted bids, secrets, signatures, USDC bonds or wallet writes.
 */
export const BASEDAGENTS_AGENT_ID = 'ag_A3fM1pJbVUBuB1bjwQYJv3DBJ26pCWDuqY5xC8aBdC5A';
export const BASEDAGENTS_PAYOUT_ADDRESS = '0x4898359899c8d5bd0BD93541F2783EcD85fAb581';
export const GXEON_OFFICIAL_BASE_ADDRESS = '0x9465810ae36b0af3c682ba6fca0fd83e0a3ef428';
const ORIGIN = 'https://api.basedagents.ai';
const PAGE_SIZE = 20;
const MAX_PAGES = 3;
const DEFAULT_TIMEOUT_MS = 6000;
const MAX_RESPONSE_BYTES = 256_000;
const PUBLIC_CACHE_TTL_MS = 60_000;
const ERROR_CACHE_TTL_MS = 12_000;
const TASK_ID = /^task_[a-zA-Z0-9]+$/;

type UnknownRecord = Record<string, unknown>;
const record = (value: unknown): UnknownRecord =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as UnknownRecord : {};
const string = (value: unknown): string | null =>
  typeof value === 'string' && value.length > 0 ? value : null;

export type FundingStatus = 'VERIFIED_ESCROW' | 'UNVERIFIED_BOUNTY' | 'FREE_REPUTATION';
export interface BasedAgentsTask {
  taskId: string;
  title: string;
  descriptionSummary: string;
  category: string | null;
  status: string;
  bountyUsdc: string | null;
  bountyNetwork: string | null;
  bondUsdc: string | null; // unknown until the provider enforces the claim challenge
  fundingStatus: FundingStatus;
  requiresHumanBondApproval: boolean;
  claimerAgentId: string | null;
  createdBy: string | null;
  payoutState: string | null;
  isPaid: boolean;
  taskUrl: string;
  requiresCapabilities: string[];
  riskFlags: string[];
}
export interface BasedAgentsSnapshot {
  provider: 'basedagents';
  status: 'CONFIRMED_PUBLIC' | 'PARTIAL' | 'UNAVAILABLE';
  observedAt: string;
  agent: {
    id: string;
    name: string | null;
    status: string | null;
    capabilities: string[];
    walletAddress: string | null;
    walletVerified: boolean | null;
    walletNetwork: string | null;
    linkedToOfficialCoinbaseBase: boolean | null;
    expectedPayoutWalletMatches: boolean | null;
    directContactConfigured: boolean | null;
    privateEventsStatus: 'AUTH_REQUIRED';
  };
  market: {
    openTasksVisible: number | null;
    fullyScanned: boolean;
    fetchedPages: number;
    totalTaskCountAuthoritative: false;
    paidListingsVisible: number | null;
    verifiedEscrowVisible: number | null;
    paidClaimsByOurAgent: number | null;
    ourClaimsVisible: number | null;
    ourClaimsCountIsCapped: boolean;
    ourPostedTasksVisible: number | null;
    ourPostedTasksCountIsCapped: boolean;
    tasks: BasedAgentsTask[];
  };
  safety: {
    mode: 'READ_ONLY_DISCOVERY';
    claimBondUsdcPerPaidSlot: 'VERIFY_PROVIDER_CURRENT_POLICY';
    claimSignedOperationsEnabled: false;
    revenuesVerifiedFromListings: false;
    note: string;
  };
  errors: string[];
}

export function normalizeBasedAgentsTask(raw: unknown): BasedAgentsTask | null {
  const obj = record(raw);
  const id = string(obj.task_id);
  if (!id || !TASK_ID.test(id) || obj.status !== 'open') return null;
  const bounty = record(obj.bounty);
  const value = string(bounty.amount_display);
  const isPaid = Boolean(value && /^\d+(?:\.\d{1,6})?$/.test(value) && Number(value) > 0);
  const escrow = record(obj.escrow);
  // Provider flags alone are not independent USDC escrow verification.
  // Never elevate a publicly advertised reward to VERIFIED_ESCROW without a chain proof.
  const providerClaimsFunded = escrow.status === 'funded' || obj.payment_verified === 1;
  const desc = string(obj.description) || '';
  const fundingStatus: FundingStatus = !isPaid ? 'FREE_REPUTATION' : 'UNVERIFIED_BOUNTY';
  const riskFlags: string[] = [];
  if (isPaid) {
    riskFlags.push('CLAIM_BOND_POLICY_VERIFY_LIVE');
    riskFlags.push('BOUNTY_FUNDING_NOT_VERIFIED');
    if (providerClaimsFunded) riskFlags.push('PROVIDER_REPORTS_FUNDED_NOT_ONCHAIN_VERIFIED');
    if (/cashback|revenue guard|paid cycle|revenue across|minimum revenue|settled .{0,55} revenue/i.test(desc)) {
      riskFlags.push('PAID_USAGE_OR_REVENUE_CONDITION');
    }
  }
  return {
    taskId: id,
    title: (string(obj.title) || 'Unnamed public task').slice(0, 180),
    // Untrusted buyer text is display-only, never executable instructions.
    descriptionSummary: desc.slice(0, 240),
    category: string(obj.category),
    status: 'open',
    bountyUsdc: isPaid ? value : null,
    bountyNetwork: isPaid ? string(bounty.network) : null,
    bondUsdc: null, // never assert a mandatory bonded amount from task listing alone
    fundingStatus,
    requiresHumanBondApproval: isPaid,
    claimerAgentId: string(obj.claimed_by_agent_id),
    createdBy: string(record(obj.creator).name),
    payoutState: string(obj.payment_status),
    isPaid,
    taskUrl: `https://basedagents.ai/tasks/${id}`,
    requiresCapabilities: Array.isArray(obj.required_capabilities)
      ? obj.required_capabilities.filter((x): x is string => typeof x === 'string').slice(0, 8)
      : [],
    riskFlags,
  };
}

async function readJson(path: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<UnknownRecord> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), timeoutMs);
  try {
    const response = await fetch(ORIGIN + path, {
      method: 'GET',
      headers: { Accept: 'application/json', 'User-Agent': 'GXEON-ReadOnly-Monitor/1.0' },
      cache: 'no-store',
      signal: abort.signal,
    });
    if (!response.ok) throw new Error('BASEDAGENTS_HTTP_' + response.status);
    const size = Number(response.headers.get('content-length') || 0);
    if (size > MAX_RESPONSE_BYTES) throw new Error('BASEDAGENTS_RESPONSE_TOO_LARGE');
    // Bound decoded streaming bytes before buffering them, including chunked or compressed responses.
    if (!response.body) throw new Error('BASEDAGENTS_RESPONSE_STREAM_REQUIRED');
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let receivedBytes = 0;
    let content = '';
    try {
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        receivedBytes += chunk.value.byteLength;
        if (receivedBytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new Error('BASEDAGENTS_RESPONSE_TOO_LARGE');
        }
        content += decoder.decode(chunk.value, { stream: true });
      }
      content += decoder.decode();
    } finally {
      reader.releaseLock();
    }
    return record(JSON.parse(content));
  } finally {
    clearTimeout(timer);
  }
}

export async function readBasedAgentsSnapshot(): Promise<BasedAgentsSnapshot> {
  const observedAt = new Date().toISOString();
  const errors: string[] = [];
  const requests = [
    ...Array.from({ length: MAX_PAGES }, (_, offsetPage) =>
      `/v1/tasks?status=open&limit=${PAGE_SIZE}&offset=${offsetPage * PAGE_SIZE}`),
    `/v1/tasks?status=all&claimer=${BASEDAGENTS_AGENT_ID}&limit=${PAGE_SIZE}`,
    `/v1/tasks?status=all&creator=${BASEDAGENTS_AGENT_ID}&limit=${PAGE_SIZE}`,
    `/v1/agents/${BASEDAGENTS_AGENT_ID}`,
  ];
  const settled = await Promise.allSettled(requests.map(path => readJson(path)));
  const pageTasks: BasedAgentsTask[][] = [];
  let fetchedPages = 0;
  for (let i = 0; i < MAX_PAGES; i++) {
    const result = settled[i];
    if (result.status === 'fulfilled' && Array.isArray(result.value.tasks)) {
      fetchedPages++;
      pageTasks.push(result.value.tasks.flatMap(raw => {
        const task = normalizeBasedAgentsTask(raw);
        return task ? [task] : [];
      }));
    } else {
      errors.push('PUBLIC_TASK_PAGE_UNAVAILABLE_' + i);
      pageTasks.push([]);
    }
  }
  const claimed = settled[MAX_PAGES]; // After the public open-task pages.
  const authored = settled[MAX_PAGES + 1];
  const profile = settled[MAX_PAGES + 2];
  const profileData = profile.status === 'fulfilled' ? profile.value : null;
  if (!profileData?.agent_id) errors.push('AGENT_PROFILE_UNAVAILABLE');
  const claimedList = claimed.status === 'fulfilled' && Array.isArray(claimed.value.tasks)
    ? claimed.value.tasks : null;
  if (!claimedList) errors.push('CLAIMED_TASKS_UNAVAILABLE');
  const authoredList = authored.status === 'fulfilled' && Array.isArray(authored.value.tasks)
    ? authored.value.tasks : null;
  if (!authoredList) errors.push('CREATED_TASKS_UNAVAILABLE');
  const unverifiedList = new Map<string, BasedAgentsTask>();
  for (const task of pageTasks.flat()) unverifiedList.set(task.taskId, task);
  const tasks = [...unverifiedList.values()];
  const paid = tasks.filter(x => x.isPaid);
  const profileMatchesIdentity = profileData?.agent_id === BASEDAGENTS_AGENT_ID;
  const actualWallet = profileMatchesIdentity ? string(profileData?.wallet_address) : null;
  // Missing or replaced wallets are identity drift, not a neutral "unavailable" match.
  // Return null only when the profile request itself failed.
  const expectedPayoutWalletMatches = !profileData ? null
    : profileMatchesIdentity && Boolean(actualWallet)
      && (actualWallet?.toLowerCase() === BASEDAGENTS_PAYOUT_ADDRESS.toLowerCase());
  if (expectedPayoutWalletMatches === false) errors.push('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  const walletVerified = profileData && typeof profileData.wallet_verified === 'boolean'
    ? profileData.wallet_verified : null;
  const fullyScanned = fetchedPages === MAX_PAGES
    && pageTasks.some((_, i) => {
      const response = settled[i];
      return response.status === 'fulfilled' && Array.isArray(response.value.tasks)
        && response.value.tasks.length < PAGE_SIZE;
    });
  return {
    provider: 'basedagents',
    // Preserve verified identity/security alerts if task listing pages are offline.
    status: fetchedPages === 0 && !profileData ? 'UNAVAILABLE'
      : errors.length ? 'PARTIAL' : 'CONFIRMED_PUBLIC',
    observedAt,
    agent: {
      id: BASEDAGENTS_AGENT_ID,
      name: profileData ? string(profileData.name) : null,
      status: profileData ? string(profileData.status) : null,
      capabilities: profileData && Array.isArray(profileData.capabilities)
        ? profileData.capabilities.filter((x): x is string => typeof x === 'string') : [],
      walletAddress: actualWallet,
      walletVerified,
      walletNetwork: profileData ? string(profileData.wallet_network) : null,
      linkedToOfficialCoinbaseBase: actualWallet
        ? actualWallet.toLowerCase() === GXEON_OFFICIAL_BASE_ADDRESS.toLowerCase() : null,
      expectedPayoutWalletMatches,
      directContactConfigured: profileData
        ? Boolean(string(profileData.contact_endpoint) || string(profileData.webhook_url)) : null,
      privateEventsStatus: 'AUTH_REQUIRED',
    },
    market: {
      openTasksVisible: fetchedPages > 0 ? tasks.length : null,
      fullyScanned,
      fetchedPages,
      totalTaskCountAuthoritative: false,
      paidListingsVisible: fetchedPages > 0 ? paid.length : null,
      verifiedEscrowVisible: fetchedPages > 0
        ? paid.filter(x => x.fundingStatus === 'VERIFIED_ESCROW').length : null,
      ourClaimsVisible: claimedList ? claimedList.length : null,
      ourClaimsCountIsCapped: Boolean(claimedList && claimedList.length === PAGE_SIZE),
      paidClaimsByOurAgent: claimedList
        ? claimedList.filter(x => Boolean(record(x.bounty).amount_display)).length : null,
      ourPostedTasksVisible: authoredList ? authoredList.length : null,
      ourPostedTasksCountIsCapped: Boolean(authoredList && authoredList.length === PAGE_SIZE),
      tasks,
    },
    safety: {
      mode: 'READ_ONLY_DISCOVERY',
      claimBondUsdcPerPaidSlot: 'VERIFY_PROVIDER_CURRENT_POLICY',
      claimSignedOperationsEnabled: false,
      revenuesVerifiedFromListings: false,
      note: 'Task listings are not invitations. Paid claims may require an AgentSig signature and a refundable USDC bond depending on live provider policy; verify before acting. No signing, payments, transfers or claims are implemented.',
    },
    errors,
  };
}

/**
 * Coalesce unauthenticated pollers into one bounded upstream read per instance.
 * Client no-store can still refresh the page; the UI always shows observedAt.
 * Serverless instances do not share this cache, so upstream rate limiting remains relevant.
 */
let publicSnapshotCache: { expiresAt: number; promise: Promise<BasedAgentsSnapshot> } | null = null;
export async function getCachedBasedAgentsSnapshot(): Promise<BasedAgentsSnapshot> {
  const now = Date.now();
  if (publicSnapshotCache && publicSnapshotCache.expiresAt > now) {
    return publicSnapshotCache.promise;
  }
  const promise = readBasedAgentsSnapshot();
  publicSnapshotCache = { expiresAt: now + PUBLIC_CACHE_TTL_MS, promise };
  const snapshot = await promise;
  if (snapshot.status === 'UNAVAILABLE' && publicSnapshotCache?.promise === promise) {
    publicSnapshotCache.expiresAt = Math.min(publicSnapshotCache.expiresAt, Date.now() + ERROR_CACHE_TTL_MS);
  }
  return snapshot;
}

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
const DEFAULT_TIMEOUT_MS = 7000;
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
  bondUsdc: string | null;
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
    ourPostedTasksVisible: number | null;
    tasks: BasedAgentsTask[];
  };
  safety: {
    mode: 'READ_ONLY_DISCOVERY';
    claimBondUsdcPerPaidSlot: '1';
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
  const escrowVerified = isPaid && escrow.status === 'funded' && obj.payment_verified === 1;
  const desc = string(obj.description) || '';
  const fundingStatus: FundingStatus = !isPaid ? 'FREE_REPUTATION'
    : escrowVerified ? 'VERIFIED_ESCROW' : 'UNVERIFIED_BOUNTY';
  const riskFlags: string[] = [];
  if (isPaid) {
    riskFlags.push('CLAIM_BOND_1_USDC_REQUIRED');
    if (!escrowVerified) riskFlags.push('BOUNTY_FUNDING_NOT_VERIFIED');
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
    bondUsdc: isPaid ? '1' : null,
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
    if (size > 2_000_000) throw new Error('BASEDAGENTS_RESPONSE_TOO_LARGE');
    // At most 20 tasks per page to bound response size and UI work.
    const text = await response.text();
    if (text.length > 2_000_000) throw new Error('BASEDAGENTS_RESPONSE_TOO_LARGE');
    return record(JSON.parse(text));
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
    `/v1/tasks?claimer=${BASEDAGENTS_AGENT_ID}&limit=${PAGE_SIZE}`,
    `/v1/tasks?creator=${BASEDAGENTS_AGENT_ID}&limit=${PAGE_SIZE}`,
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
  const actualWallet = profileData ? string(profileData.wallet_address) : null;
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
    status: fetchedPages === 0 ? 'UNAVAILABLE'
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
      paidClaimsByOurAgent: claimedList
        ? claimedList.filter(x => Boolean(record(x.bounty).amount_display)).length : null,
      ourPostedTasksVisible: authoredList ? authoredList.length : null,
      tasks,
    },
    safety: {
      mode: 'READ_ONLY_DISCOVERY',
      claimBondUsdcPerPaidSlot: '1',
      claimSignedOperationsEnabled: false,
      revenuesVerifiedFromListings: false,
      note: 'Task listings are not invitations. Paid claims need signed AgentSig and a bonded 1 USDC slot. No signing, payments, transfers or claim actions are implemented.',
    },
    errors,
  };
}

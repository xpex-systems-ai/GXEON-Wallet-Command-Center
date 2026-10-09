import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASEDAGENTS_AGENT_ID, GXEON_OFFICIAL_BASE_ADDRESS,
  normalizeBasedAgentsTask, readBasedAgentsSnapshot, getCachedBasedAgentsSnapshot,
} from './basedAgentsReadOnly';

afterEach(() => vi.unstubAllGlobals());

const openTask = (taskId = 'task_Test123') => ({
  task_id: taskId, status: 'open', title: 'Safe JSON validator',
  description: 'Validate public JSON, no spending required',
  category: 'automation', required_capabilities: ['json', 'code-review'],
  bounty: { amount_display: '0.25', token: 'USDC', network: 'eip155:8453' },
  payment_status: 'pending',
});
const okay = (body: object) => {
  const bytes = new TextEncoder().encode(JSON.stringify(body));
  return {
    ok: true, headers: { get: () => null },
    body: { getReader: () => {
      let consumed = false;
      return {
        read: async () => {
          if (consumed) return { done: true as const, value: undefined };
          consumed = true;
          return { done: false as const, value: bytes };
        },
        cancel: async () => undefined,
        releaseLock: () => undefined,
      };
    } },
  };
};

describe('BasedAgents read-only task normalization', () => {
  it('rejects arbitrary HTML / URLs and non-open tasks', () => {
    expect(normalizeBasedAgentsTask({ ...openTask(), task_id: 'https://evil.test' })).toBeNull();
    expect(normalizeBasedAgentsTask({ ...openTask(), status: 'claimed' })).toBeNull();
  });
  it('never marks pending advertised rewards as onchain funded', () => {
    const task = normalizeBasedAgentsTask(openTask())!;
    expect(task).toMatchObject({
      taskId: 'task_Test123', isPaid: true, fundingStatus: 'UNVERIFIED_BOUNTY',
      bountyUsdc: '0.25', bondUsdc: null,
      requiresHumanBondApproval: true,
      taskUrl: 'https://basedagents.ai/tasks/task_Test123',
    });
    expect(task.riskFlags).toContain('BOUNTY_FUNDING_NOT_VERIFIED');
    expect(task.riskFlags).toContain('CLAIM_BOND_POLICY_VERIFY_LIVE');
  });
  it('preserves Base Sepolia payout network instead of treating test USDC as mainnet', () => {
    const task = normalizeBasedAgentsTask({
      ...openTask(), bounty: { amount_display: '3.00', token: 'USDC', network: 'eip155:84532' },
    })!;
    expect(task.bountyNetwork).toBe('eip155:84532');
    expect(task.bountyAmount).toBe('3.00');
    expect(task.bountyUsdc).toBeNull();
    expect(task.fundingStatus).toBe('UNVERIFIED_BOUNTY');
  });

  it.each([
    { amount_display: '2.50', token: 'ETH', network: 'eip155:8453' },
    { amount_display: '2.50', network: 'eip155:8453' },
    { amount_display: '2.50', token: 'USDC' },
    { amount_display: '2.50', token: 'USDC', network: 'base' },
  ])('preserves the advertised reward without inventing Base USDC: %j', bounty => {
    const task = normalizeBasedAgentsTask({ ...openTask(), bounty })!;
    expect(task.isPaid).toBe(true);
    expect(task.bountyAmount).toBe('2.50');
    expect(task.bountyToken).toBe(bounty.token || null);
    expect(task.bountyUsdc).toBeNull();
    expect(task.fundingStatus).toBe('UNVERIFIED_BOUNTY');
    expect(task.riskFlags).toContain('REWARD_CURRENCY_OR_NETWORK_UNVERIFIED');
  });
  it('does not accept unbounded or zero advertised amounts as a paid reward', () => {
    for (const amount_display of ['0', '0.00', '9'.repeat(400), '-1', 'NaN']) {
      const task = normalizeBasedAgentsTask({
        ...openTask(), bounty: { amount_display, token: 'USDC', network: 'eip155:8453' },
      })!;
      expect(task.isPaid).toBe(false);
      expect(task.bountyUsdc).toBeNull();
    }
  });

  it('flags paid-usage conditions and keeps free tasks distinct', () => {
    const conditional = normalizeBasedAgentsTask({
      ...openTask(), description: 'Minimum revenue generated across paid cycles',
    })!;
    expect(conditional.riskFlags).toContain('PAID_USAGE_OR_REVENUE_CONDITION');
    const free = normalizeBasedAgentsTask({ ...openTask('task_Free'), bounty: null })!;
    expect(free.fundingStatus).toBe('FREE_REPUTATION');
    expect(free.bondUsdc).toBeNull();
    expect(free.isPaid).toBe(false);
  });
  it('does not treat provider escrow=true as blockchain proof', () => {
    const task = normalizeBasedAgentsTask({
      ...openTask(), payment_verified: 1, escrow: { status: 'funded' },
    })!;
    expect(task.fundingStatus).toBe('UNVERIFIED_BOUNTY');
    expect(task.riskFlags).toContain('PROVIDER_REPORTS_FUNDED_NOT_ONCHAIN_VERIFIED');
  });

  it('does not treat strings or spoofed escrow metadata as verified payments', () => {
    const task = normalizeBasedAgentsTask({
      ...openTask(), payment_verified: '1', escrow: { status: 'funded' },
    })!;
    expect(task.fundingStatus).toBe('UNVERIFIED_BOUNTY');
  });
});

describe('GXEON BasedAgents snapshot', () => {
  it('reads public task pages and registered identity without claiming anything', async () => {
    const fetchMock = vi.fn(async (url: string, _options?: RequestInit) => {
      if (url.includes('claimer=')) return okay({ tasks: [] });
      if (url.includes('creator=')) return okay({ tasks: [] });
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI', status: 'active',
        wallet_address: '0x4898359899c8d5bd0BD93541F2783EcD85fAb581',
        wallet_network: 'eip155:8453',
        wallet_verified: true, capabilities: ['code-reviw'],
        contact_endpoint: null, webhook_url: null,
      });
      if (url.includes('offset=0')) return okay({ tasks: [openTask()] });
      return okay({ tasks: [] });
    });
    vi.stubGlobal('fetch', fetchMock);
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('CONFIRMED_PUBLIC');
    expect(snapshot.market).toMatchObject({
      openTasksVisible: 1, paidListingsVisible: 1,
      ourClaimsVisible: 0, verifiedEscrowVisible: 0, fullyScanned: true,
    });
    expect(snapshot.agent.walletVerified).toBe(true);
    expect(snapshot.agent.expectedPayoutWalletMatches).toBe(true);
    expect(snapshot.market.ourClaimsCountIsCapped).toBe(false);
    expect(snapshot.agent.walletAddress?.toLowerCase()).not.toBe(GXEON_OFFICIAL_BASE_ADDRESS);
    expect(snapshot.agent.linkedToOfficialCoinbaseBase).toBe(false);
    expect(snapshot.agent.directContactConfigured).toBe(false);
    expect(snapshot.agent.privateEventsStatus).toBe('AUTH_REQUIRED');
    expect(snapshot.safety).toMatchObject({
      mode: 'READ_ONLY_DISCOVERY', claimSignedOperationsEnabled: false,
      revenuesVerifiedFromListings: false,
    });
    expect(fetchMock).toHaveBeenCalledTimes(6);
    expect(fetchMock.mock.calls.every(call => call[1]?.method === 'GET')).toBe(true);
  });
  it('downgrades a payout wallet drift instead of silently reporting the old expected wallet', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI',
        wallet_address: '0x1111111111111111111111111111111111111111',
        wallet_verified: true,
      });
      return okay({ tasks: [] });
    }));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('PARTIAL');
    expect(snapshot.agent.expectedPayoutWalletMatches).toBe(false);
    expect(snapshot.errors).toContain('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  });

  it('does not accept malformed HTTP-200 profile as payout wallet drift or a verified identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) =>
      url.includes('/agents/') ? okay({ wallet_verified: true }) : okay({ tasks: [] })));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('PARTIAL');
    expect(snapshot.agent.walletVerified).toBeNull();
    expect(snapshot.agent.expectedPayoutWalletMatches).toBeNull();
    expect(snapshot.errors).toContain('AGENT_PROFILE_UNAVAILABLE');
    expect(snapshot.errors).not.toContain('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  });
  it('rejects a correct address registered to Base Sepolia instead of Base mainnet', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI',
        wallet_address: '0x4898359899c8d5bd0BD93541F2783EcD85fAb581',
        wallet_network: 'eip155:84532', wallet_verified: true,
      });
      return okay({ tasks: [] });
    }));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('PARTIAL');
    expect(snapshot.agent.expectedPayoutWalletMatches).toBe(false);
    expect(snapshot.errors).toContain('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  });

  it('alerts when profile wallet disappears instead of treating identity as unchanged', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI',
        wallet_address: null, wallet_verified: false,
      });
      return okay({ tasks: [] });
    }));
    const result = await readBasedAgentsSnapshot();
    expect(result.status).toBe('PARTIAL');
    expect(result.agent.expectedPayoutWalletMatches).toBe(false);
    expect(result.errors).toContain('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  });

  it('preserves security profile alerts if ALL public task pages are unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI',
        wallet_address: '0x1111111111111111111111111111111111111111',
      });
      throw new Error('task feed offline');
    }));
    const result = await readBasedAgentsSnapshot();
    expect(result.status).toBe('PARTIAL');
    expect(result.market.openTasksVisible).toBeNull();
    expect(result.agent.expectedPayoutWalletMatches).toBe(false);
    expect(result.errors).toContain('BASEDAGENTS_PAYOUT_ADDRESS_CHANGED');
  });

  it('labels 20 returned claims as capped, never an authoritative total', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI',
        wallet_address: '0x4898359899c8d5bd0BD93541F2783EcD85fAb581',
        wallet_network: 'eip155:8453',
        wallet_verified: true,
      });
      if (url.includes('claimer=')) return okay({ tasks: Array.from({ length: 20 }, (_, i) => ({ task_id: 'task_' + i })) });
      return okay({ tasks: [] });
    }));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.market.ourClaimsVisible).toBe(20);
    expect(snapshot.market.ourClaimsCountIsCapped).toBe(true);
  });

  it.each(['http-error', 'oversized-header'] as const)(
    'cancels rejected response streams before reading the body: %s',
    async kind => {
      const cancel = vi.fn().mockResolvedValue(undefined);
      const getReader = vi.fn();
      vi.stubGlobal('fetch', vi.fn(async () => ({
        ok: kind !== 'http-error', status: 503,
        headers: { get: () => kind === 'oversized-header' ? '256001' : null },
        body: { cancel, getReader },
      })));
      const snapshot = await readBasedAgentsSnapshot();
      expect(snapshot.status).toBe('UNAVAILABLE');
      expect(cancel).toHaveBeenCalledTimes(6);
      expect(getReader).not.toHaveBeenCalled();
    },
  );

  it('rejects an oversized decoded response before buffering all bytes', async () => {
    const manyBytes = new Uint8Array(2_000_001);
    let cancelled = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      headers: { get: () => null },
      body: { getReader: () => ({
        read: async () => ({ done: false, value: manyBytes }),
        cancel: async () => { cancelled = true; },
        releaseLock: () => undefined,
      }) },
    })));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('UNAVAILABLE');
    expect(cancelled).toBe(true);
  });

  it('coalesces concurrent unauthenticated dashboard reads into one provider call batch', async () => {
    const mock = vi.fn(async (url: string) => {
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID,
        wallet_address: '0x4898359899c8d5bd0BD93541F2783EcD85fAb581',
        wallet_network: 'eip155:8453',
      });
      return okay({ tasks: [] });
    });
    vi.stubGlobal('fetch', mock);
    const [first, second] = await Promise.all([
      getCachedBasedAgentsSnapshot(), getCachedBasedAgentsSnapshot(),
    ]);
    expect(first).toBe(second);
    expect(first.agent.expectedPayoutWalletMatches).toBe(true);
    expect(mock).toHaveBeenCalledTimes(6);
  });

  it('fails closed when every public page is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('UNAVAILABLE');
    expect(snapshot.market.openTasksVisible).toBeNull();
    expect(snapshot.market.ourClaimsVisible).toBeNull();
    expect(snapshot.agent.walletVerified).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  BASEDAGENTS_AGENT_ID, GXEON_OFFICIAL_BASE_ADDRESS,
  normalizeBasedAgentsTask, readBasedAgentsSnapshot,
} from './basedAgentsReadOnly';

afterEach(() => vi.unstubAllGlobals());

const openTask = (taskId = 'task_Test123') => ({
  task_id: taskId, status: 'open', title: 'Safe JSON validator',
  description: 'Validate public JSON, no spending required',
  category: 'automation', required_capabilities: ['json', 'code-review'],
  bounty: { amount_display: '0.25', network: 'base' },
  payment_status: 'pending',
});
const okay = (body: object) => ({
  ok: true, headers: { get: () => null },
  text: async () => JSON.stringify(body),
});

describe('BasedAgents read-only task normalization', () => {
  it('rejects arbitrary HTML / URLs and non-open tasks', () => {
    expect(normalizeBasedAgentsTask({ ...openTask(), task_id: 'https://evil.test' })).toBeNull();
    expect(normalizeBasedAgentsTask({ ...openTask(), status: 'claimed' })).toBeNull();
  });
  it('never marks pending advertised rewards as onchain funded', () => {
    const task = normalizeBasedAgentsTask(openTask())!;
    expect(task).toMatchObject({
      taskId: 'task_Test123', isPaid: true, fundingStatus: 'UNVERIFIED_BOUNTY',
      bountyUsdc: '0.25', bondUsdc: '1',
      requiresHumanBondApproval: true,
      taskUrl: 'https://basedagents.ai/tasks/task_Test123',
    });
    expect(task.riskFlags).toContain('BOUNTY_FUNDING_NOT_VERIFIED');
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
  it('does not treat strings or spoofed escrow metadata as verified payments', () => {
    const task = normalizeBasedAgentsTask({
      ...openTask(), payment_verified: '1', escrow: { status: 'funded' },
    })!;
    expect(task.fundingStatus).toBe('UNVERIFIED_BOUNTY');
  });
});

describe('GXEON BasedAgents snapshot', () => {
  it('reads public task pages and registered identity without claiming anything', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.includes('claimer=')) return okay({ tasks: [] });
      if (url.includes('creator=')) return okay({ tasks: [] });
      if (url.includes('/agents/')) return okay({
        agent_id: BASEDAGENTS_AGENT_ID, name: 'GXEON-AI', status: 'active',
        wallet_address: '0x4898359899c8d5bd0BD93541F2783EcD85fAb581',
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
  it('fails closed when every public page is unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const snapshot = await readBasedAgentsSnapshot();
    expect(snapshot.status).toBe('UNAVAILABLE');
    expect(snapshot.market.openTasksVisible).toBeNull();
    expect(snapshot.market.ourClaimsVisible).toBeNull();
    expect(snapshot.agent.walletVerified).toBeNull();
  });
});

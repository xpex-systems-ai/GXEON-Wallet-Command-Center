import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { TaskmarketConnector } from '../../src/agent-economy/connectors/taskmarketConnector.js';
import { qualifyTask } from '../../src/agent-economy/taskmarket/qualification.js';
import { getSchedulerHealth, TASKMARKET_POLL_CADENCE, withSchedulerHealth } from '../../src/agent-economy/taskmarket/schedulerHealth.js';
import { scanTaskmarket } from '../../src/agent-economy/taskmarket/taskmarketRadar.js';
import { assessmentFixture, fundingFixture, identityFixture, legalFixture, reputationFixture, taskFixture, worker } from '../fixtures/taskmarket.js';

const now = Date.parse('2026-09-29T15:40:00Z');
describe('background radar freshness', () => {
  it('distinguishes a missing, fresh, delayed or invalid durable poll', () => {
    expect(getSchedulerHealth(null, now).health).toBe('AWAITING_FIRST_POLL');
    expect(getSchedulerHealth('2026-09-29T15:10:00Z', now).health).toBe('CURRENT');
    expect(getSchedulerHealth('2026-09-29T15:09:59Z', now)).toEqual({ health: 'DELAYED', ageSeconds: 1801 });
    expect(getSchedulerHealth('bad-date', now).health).toBe('INVALID_TIMESTAMP');
    expect(getSchedulerHealth('2026-09-29T15:41:00Z', now).health).toBe('INVALID_TIMESTAMP');
  });
  it('does not let a fresh manual read erase an overdue scheduled poll', async () => {
    const connector = new TaskmarketConnector(vi.fn(async () => new Response('{}', { status: 503 })));
    const snapshot = await scanTaskmarket({ connector });
    snapshot.fetchedAt = new Date(now).toISOString();
    snapshot.scheduler.lastSuccessfulPoll = '2026-09-29T14:17:12Z';
    snapshot.scheduler.health = 'CURRENT';
    const result = withSchedulerHealth(snapshot, now);
    expect(result.scheduler.health).toBe('DELAYED');
    expect(result.scheduler.lastSuccessfulPoll).toBe('2026-09-29T14:17:12Z');
    expect(snapshot.scheduler.health).toBe('CURRENT');
  });
  it('advertises the same fifteen-minute cadence as the deployed workflow', () => {
    const workflow = readFileSync(new URL('../../.github/workflows/taskmarket-radar.yml', import.meta.url), 'utf8');
    expect(workflow).toContain(`cron: '${TASKMARKET_POLL_CADENCE}'`);
    const minutes = TASKMARKET_POLL_CADENCE.split(' ')[0].split(',').map(Number);
    expect(minutes.map((minute, i) => (minutes[(i + 1) % minutes.length] + 60 - minute) % 60)).toEqual([15, 15, 15, 15]);
  });
});

describe('identity must match the current registry and chain', () => {
  it.each([true, false])('requires current identity cache (cacheFresh=%s)', async cacheFresh => {
    const fetcher = vi.fn<typeof fetch>(async url => {
      const path = String(url);
      const data = path.includes('/identity/status') ? { registered: true, agentId: '42', cacheFresh }
        : path.includes('/wallet/balance') ? { address: worker, balanceBaseUnits: '0' }
          : { address: worker, completedTasks: 0, totalEarnings: '0', averageRating: 0 };
      return new Response(JSON.stringify(data));
    });
    const result = await new TaskmarketConnector(fetcher).getWorkerStatus(worker);
    expect(result.registered).toBe(cacheFresh);
    expect(result.status).toBe(cacheFresh ? 'REGISTERED' : 'REGISTRATION_PENDING');
    expect(result.agentId).toBe('42');
    expect(fetcher.mock.calls.every(([, options]) => options?.method === 'GET')).toBe(true);
  });
  it('blocks stale identity even if a stored snapshot says registered', () => {
    const task = taskFixture();
    const result = qualifyTask(task, { funding: fundingFixture(), legal: legalFixture, requester: reputationFixture,
      assessment: assessmentFixture(task), identity: { ...identityFixture, cacheFresh: false } });
    expect(result.blockers).toContain('WORKER_IDENTITY_REQUIRED');
    expect(result.state).not.toBe('CLAIM_READY');
  });
});

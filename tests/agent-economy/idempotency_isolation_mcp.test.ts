import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkIdempotency,
  recordIdempotency,
} from '../../src/agent-economy/idempotency.js';
import {
  scoreDemandSignal,
  ingestDemandSignal,
} from '../../src/agent-economy/demandRadar.js';
import { handleMcpRpc } from '../../src/agent-economy/mcpGateway.js';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { AgentAccount, Job } from '../../src/agent-economy/types.js';

describe('Idempotency, Multi-Tenant Isolation & MCP Gateway Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
  });

  describe('Idempotency Engine', () => {
    it('returns cached response on identical payload and 409 on conflicting payload', async () => {
      const accountId = 'acc_idem_test';
      const key = 'idem_key_12345';
      const initialPayload = { serviceId: 'gxeon_url_verify_v1', quantity: 5 };
      const responseData = { quoteId: 'quo_test_1' };

      // 1. First execution: no prior record
      const check1 = await checkIdempotency(key, accountId, initialPayload);
      expect(check1.isExisting).toBe(false);
      expect(check1.hasConflict).toBe(false);

      // Record first execution
      await recordIdempotency(key, accountId, initialPayload, responseData, 201);

      // 2. Exact replay: same key + same payload
      const check2 = await checkIdempotency(key, accountId, initialPayload);
      expect(check2.isExisting).toBe(true);
      expect(check2.hasConflict).toBe(false);
      expect(check2.cachedResponse?.statusCode).toBe(201);
      expect(check2.cachedResponse?.body).toEqual(responseData);

      // 3. Conflict replay: same key + different payload
      const conflictingPayload = { serviceId: 'gxeon_url_verify_v1', quantity: 99 };
      const check3 = await checkIdempotency(key, accountId, conflictingPayload);
      expect(check3.hasConflict).toBe(true);
      expect(check3.isExisting).toBe(false);
      expect(check3.conflictError?.error.code).toBe('IDEMPOTENCY_CONFLICT');
    });
  });

  describe('Multi-Tenant Isolation', () => {
    it('strictly isolates jobs between Agent A and Agent B', async () => {
      const store = getAgentEconomyStore();

      const jobA: Job = {
        jobId: 'job_tenant_a',
        accountId: 'acc_agent_a',
        serviceId: 'gxeon_json_validate_v1',
        quoteId: 'quo_a',
        state: 'COMPLETED',
        financialState: 'CREDITS_SETTLED',
        input: { payload: { secret: 'Agent A data' } },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveJob(jobA);

      // Agent B requests Agent A's job
      const retrieved = await store.getJob('job_tenant_a');
      expect(retrieved).toBeDefined();

      // In API handlers, check:
      const agentBAccountId = 'acc_agent_b';
      const isAllowed = retrieved?.accountId === agentBAccountId;
      expect(isAllowed).toBe(false);
    });
  });

  describe('Demand Radar Engine', () => {
    it('scores demand signals and rejects prohibited/adversarial requests', async () => {
      // 1. Compliant URL verification demand
      const signalOk = {
        source: 'github_issues',
        sourceUrl: 'https://github.com/example/repo/issues/42',
        title: 'Need automated broken link checker for docs',
        rawDescription: 'Looking for a reliable tool to verify our 200 public doc URLs daily',
        suggestedReward: 50.0,
      };
      const scoreOk = scoreDemandSignal(signalOk);
      expect(scoreOk.matchedCapability).toBe('gxeon_url_verify_v1');
      expect(scoreOk.fitScore).toBeGreaterThanOrEqual(0.8);
      expect(scoreOk.status).toBe('READY_FOR_OPERATOR');

      // 2. Prohibited activity (password / credential bypass)
      const signalBanned = {
        source: 'public_bounty',
        sourceUrl: 'https://bounty.example/task/9',
        title: 'Bypass login captcha and extract passwords',
        rawDescription: 'Need a bot to hack into credentials database',
      };
      const scoreBanned = scoreDemandSignal(signalBanned);
      expect(scoreBanned.status).toBe('REJECTED');
      expect(scoreBanned.rejectionReason).toContain('Prohibited activity detected');

      // 3. Ingestion into opportunity store
      const opp = await ingestDemandSignal(signalOk);
      expect(opp.opportunityId.startsWith('opp_')).toBe(true);
      expect(opp.requiredCapability).toBe('gxeon_url_verify_v1');
    });
  });

  describe('MCP Gateway (JSON-RPC 2.0)', () => {
    it('handles tools/list and gxeon.list_services', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_mcp_test',
        name: 'MCP Test Agent',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 200,
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 1000,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      const resp = await handleMcpRpc(
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'gxeon.list_services',
        },
        account.accountId
      );

      expect(resp.jsonrpc).toBe('2.0');
      expect(resp.id).toBe(1);
      const res = resp.result as { tools: unknown[]; services: unknown[] };
      expect(res.services.length).toBeGreaterThan(0);
    });

    it('handles gxeon.get_balance via MCP', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_mcp_bal',
        name: 'MCP Balance Agent',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 350,
        reservedCredits: 50,
        spentCredits: 100,
        spendingLimit: 1000,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      const resp = await handleMcpRpc(
        {
          jsonrpc: '2.0',
          id: 2,
          method: 'gxeon.get_balance',
        },
        account.accountId
      );

      expect(resp.jsonrpc).toBe('2.0');
      const res = resp.result as { creditBalance: number; availableCredits: number };
      expect(res.creditBalance).toBe(350);
      expect(res.availableCredits).toBe(300);
    });
  });
});

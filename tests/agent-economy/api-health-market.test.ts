import { beforeEach, describe, expect, it } from 'vitest';
import { executeApiHealthWorker } from '../../src/agent-economy/workers/apiHealthWorker.js';
import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { handleMcpRpc } from '../../src/agent-economy/mcpGateway.js';
import type { AgentAccount } from '../../src/agent-economy/types.js';

const account: AgentAccount = {
  accountId: 'acc_api_health_unit',
  name: 'API Health unit buyer',
  status: 'ACTIVE',
  billingMode: 'PREPAID_CREDITS',
  creditBalance: 10,
  reservedCredits: 0,
  spentCredits: 0,
  spendingLimit: 2000,
  dailyLimit: 2000,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

beforeEach(() => {
  resetAgentEconomyStoreForTesting();
});

describe('GXEON API Health marketplace capability', () => {
  it('publishes API Health as an available prepaid service at 10 credits per endpoint', () => {
    const service = listAvailableServices().find(
      item => item.serviceId === 'gxeon_api_health_v1'
    );
    expect(service).toMatchObject({
      name: 'GXEON API Health',
      unit: 'endpoint',
      unitPriceCredits: 10,
      minimumChargeCredits: 10,
      maxBatch: 20,
      executionPolicy: 'STRICT_ANTI_SSRF_OUTBOUND',
      status: 'AVAILABLE',
    });
  });

  it('blocks loopback targets before making a private-network request', async () => {
    const result = await executeApiHealthWorker({
      endpoints: [{ url: 'http://127.0.0.1/admin', expectedStatus: 200 }],
    });

    expect(result.summary).toEqual({ total: 1, healthy: 0, failed: 1 });
    expect(result.results[0]).toMatchObject({
      url: 'http://127.0.0.1/admin',
      status: 0,
      healthy: false,
    });
    expect(result.results[0]?.error).toContain('SSRF Blocked');
  });

  it('executes API Health through prepaid MCP and settles exactly 10 credits', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount(account);

    const response = await handleMcpRpc(
      {
        jsonrpc: '2.0',
        id: 10,
        method: 'tools/call',
        params: {
          name: 'gxeon_api_health_v1',
          arguments: {
            endpoints: [
              {
                url: 'http://127.0.0.1/private',
                expectedStatus: 200,
                requiredFields: ['ok'],
              },
            ],
          },
        },
      },
      account.accountId
    );

    const result = response.result as {
      content?: Array<{ type: string; text: string }>;
      isError?: boolean;
    };
    expect(result.isError).toBe(false);
    const body = JSON.parse(result.content?.[0]?.text || '{}');
    expect(body.summary).toEqual({ total: 1, healthy: 0, failed: 1 });
    expect(body.results[0].error).toContain('SSRF Blocked');

    const after = await store.getAccount(account.accountId);
    expect(after?.creditBalance).toBe(0);
    expect(after?.spentCredits).toBe(10);
    expect((await store.getLedgerEntries(account.accountId)).map(entry => entry.type)).toEqual([
      'RESERVE',
      'DEBIT',
    ]);
  });
});

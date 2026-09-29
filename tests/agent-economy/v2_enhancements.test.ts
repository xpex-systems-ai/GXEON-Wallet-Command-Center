import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { submitJobAdmission } from '../../src/agent-economy/admissionService.js';
import { createQuote } from '../../src/agent-economy/quoteEngine.js';
import { handleMcpRpc } from '../../src/agent-economy/mcpGateway.js';
import { fetchAndIngestX402Demand } from '../../src/agent-economy/connectors/x402BazaarConnector.js';
import { scoreDemandSignal, ingestDemandSignal } from '../../src/agent-economy/demandRadar.js';
import { TOPUP_PACKS } from '../../api/v1/billing/topup.js';
import { AgentAccount } from '../../src/agent-economy/types.js';

describe('GXEON Machine Market V2 Enhancements Test Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
  });

  describe('Unified Admission Layer & Unit Recalculation', () => {
    it('recalculates units from payload array and rejects quantity mismatch', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_adm_test',
        name: 'Admission Tester',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 100,
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 1000,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      // Create quote for 2 units
      const quoteRes = await createQuote({
        accountId: account.accountId,
        serviceId: 'gxeon_url_verify_v1',
        quantity: 2,
      });
      expect(quoteRes.success).toBe(true);
      const quoteId = quoteRes.quote!.quoteId;

      // Submit job with 3 URLs (payload has 3 units, quote was for 2) -> must reject
      const admMismatch = await submitJobAdmission({
        accountId: account.accountId,
        quoteId,
        input: {
          urls: [
            'https://example.com/1',
            'https://example.com/2',
            'https://example.com/3',
          ],
        },
      });
      expect(admMismatch.success).toBe(false);
      expect(admMismatch.statusCode).toBe(400);
      expect(admMismatch.error?.error.code).toBe('QUANTITY_MISMATCH');

      // Submit job with exactly 2 URLs matching the quote -> must succeed
      const admSuccess = await submitJobAdmission({
        accountId: account.accountId,
        quoteId,
        input: {
          urls: [
            'https://example.com/1',
            'https://example.com/2',
          ],
        },
      });
      expect(admSuccess.success).toBe(true);
      expect(admSuccess.job?.state).toBe('COMPLETED');
      expect(admSuccess.result?.summary.total).toBe(2);
    });

    it('rejects submission when account has insufficient credits', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_poor',
        name: 'Poor Agent',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 2, // only 2 credits
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 1000,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      const quoteRes = await createQuote({
        accountId: account.accountId,
        serviceId: 'gxeon_url_verify_v1',
        quantity: 5, // requires at least 25 credits
      });
      const quoteId = quoteRes.quote!.quoteId;

      const adm = await submitJobAdmission({
        accountId: account.accountId,
        quoteId,
        input: {
          urls: ['https://example.com/1', 'https://example.com/2', 'https://example.com/3', 'https://example.com/4', 'https://example.com/5'],
        },
      });
      expect(adm.success).toBe(false);
      expect(adm.statusCode).toBe(402);
      expect(adm.error?.error.code).toBe('INSUFFICIENT_CREDITS');
    });
  });

  describe('MCP Modern Gateway (tools/list and tools/call)', () => {
    it('handles initialize method returning supported protocol version', async () => {
      const resp = await handleMcpRpc(
        {
          jsonrpc: '2.0',
          id: 'init_1',
          method: 'initialize',
        },
        'acc_test'
      );
      expect(resp.jsonrpc).toBe('2.0');
      const res = resp.result as { protocolVersion: string; serverInfo: { name: string } };
      expect(res.protocolVersion).toBe('2026-07-28');
      expect(res.serverInfo.name).toBe('gxeon-capability-market');
    });

    it('executes tools/call for get_quote and submit_job', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_mcp_v2',
        name: 'MCP V2 Agent',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 500,
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 1000,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      // 1. Call get_quote tool
      const quoteToolResp = await handleMcpRpc(
        {
          jsonrpc: '2.0',
          id: 10,
          method: 'tools/call',
          params: {
            name: 'get_quote',
            arguments: {
              serviceId: 'gxeon_json_validate_v1',
              quantity: 1,
            },
          },
        },
        account.accountId
      );

      expect(quoteToolResp.jsonrpc).toBe('2.0');
      const quoteResult = quoteToolResp.result as { content: Array<{ text: string }>; isError: boolean };
      expect(quoteResult.isError).toBe(false);
      const parsedQuote = JSON.parse(quoteResult.content[0].text);
      expect(parsedQuote.quoteId).toBeDefined();

      // 2. Call submit_job tool
      const submitToolResp = await handleMcpRpc(
        {
          jsonrpc: '2.0',
          id: 11,
          method: 'tools/call',
          params: {
            name: 'submit_job',
            arguments: {
              quoteId: parsedQuote.quoteId,
              input: {
                schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
                data: { ok: true },
              },
            },
          },
        },
        account.accountId
      );

      expect(submitToolResp.jsonrpc).toBe('2.0');
      const submitResult = submitToolResp.result as { content: Array<{ text: string }>; isError: boolean };
      expect(submitResult.isError).toBe(false);
      const parsedJobResult = JSON.parse(submitResult.content[0].text);
      expect(parsedJobResult.state).toBe('COMPLETED');
      expect(parsedJobResult.summary.healthy).toBe(1);
    });
  });

  describe('Demand Radar & x402 Bazaar Connector', () => {
    it('sets estimatedValue to null when reward is unknown (not 25 by default)', async () => {
      const signalWithoutReward = {
        source: 'cdp_discovery',
        sourceUrl: 'https://cdp.coinbase.com/x402/test',
        title: 'Broken link crawler needed',
        rawDescription: 'Automated agent checking dead links',
      };

      const opp = await ingestDemandSignal(signalWithoutReward);
      expect(opp.estimatedValue).toBeNull();
      expect(opp.requiredCapability).toBe('gxeon_url_verify_v1');
    });

    it('normalizes x402 discovery as supply rather than a paid job', async () => {
      const discoveryFetch = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 'test-supply', name: 'JSON validator', url: 'https://example.com/json', description: 'Validate JSON' }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
      const opps = await fetchAndIngestX402Demand({ query: 'verification', limit: 2 });
      expect(Array.isArray(opps)).toBe(true);
      discoveryFetch.mockRestore();
      expect(opps).toHaveLength(1);
      for (const opp of opps) {
        expect(opp.source).toBe('x402_bazaar');
        expect(['SUPPLY_LISTING', 'USAGE_SIGNAL']).toContain(opp.kind);
      }
    });
  });

  describe('Prepaid Stripe Rail Configuration', () => {
    it('defines valid topup packs in BRL centavos', () => {
      expect(TOPUP_PACKS.pack_100.priceCents).toBe(2000); // R$ 20.00
      expect(TOPUP_PACKS.pack_500.priceCents).toBe(8000); // R$ 80.00
      expect(TOPUP_PACKS.pack_2000.priceCents).toBe(25000); // R$ 250.00
    });
  });
});

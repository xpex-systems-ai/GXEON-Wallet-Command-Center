import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateApiKey,
  authenticateMachineRequest,
} from '../../src/agent-economy/auth.js';
import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { createQuote, validateQuote } from '../../src/agent-economy/quoteEngine.js';
import {
  reserveCredits,
  getAccountBalance,
} from '../../src/agent-economy/ledger.js';
import { getGxeonCommander } from '../../src/agent-economy/commander.js';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { AgentAccount, ApiKeyRecord, Job } from '../../src/agent-economy/types.js';

describe('GXEON Section 43 End-to-End Pilot Proof Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
  });

  it('executes full autonomous machine capability workflow with 10,000 TEST credits', async () => {
    const store = getAgentEconomyStore();

    // 1. Provision TEST Agent Account with 10,000 TEST credits
    const accountId = 'acc_pilot_agent_001';
    const pilotAccount: AgentAccount = {
      accountId,
      name: 'Pilot External Autonomous Agent',
      status: 'ACTIVE',
      billingMode: 'PREPAID_CREDITS',
      creditBalance: 10_000,
      reservedCredits: 0,
      spentCredits: 0,
      spendingLimit: 50_000,
      dailyLimit: 20_000,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.saveAccount(pilotAccount);

    // Issue API Key
    const { rawKey, keyRecord } = generateApiKey();
    const apiKeyRecord: ApiKeyRecord = {
      ...keyRecord,
      accountId,
      scopes: [
        'services:read',
        'quotes:create',
        'jobs:create',
        'jobs:read',
        'results:read',
        'balance:read',
      ],
    };
    await store.saveApiKey(apiKeyRecord);

    // Verify initial balance
    let balance = await getAccountBalance(accountId);
    expect(balance?.creditBalance).toBe(10_000);
    expect(balance?.availableCredits).toBe(10_000);
    expect(balance?.reservedCredits).toBe(0);

    // 2. Discover Capabilities (GET /v1/services)
    const auth1 = await authenticateMachineRequest(`Bearer ${rawKey}`, 'services:read');
    expect(auth1.authenticated).toBe(true);
    const services = listAvailableServices();
    expect(services.length).toBeGreaterThanOrEqual(2);
    expect(services.some((s) => s.serviceId === 'gxeon_json_validate_v1')).toBe(true);

    // 3. Request Quote (POST /v1/quote)
    const auth2 = await authenticateMachineRequest(`Bearer ${rawKey}`, 'quotes:create');
    expect(auth2.authenticated).toBe(true);
    const quoteRes = await createQuote({
      accountId,
      serviceId: 'gxeon_json_validate_v1',
      quantity: 5,
    });
    expect(quoteRes.success).toBe(true);
    expect(quoteRes.quote).toBeDefined();
    const quote = quoteRes.quote!;
    expect(quote.totalCredits).toBe(10); // 5 * 2 = 10 credits

    // 4. Submit Capability Job (POST /v1/jobs)
    const auth3 = await authenticateMachineRequest(`Bearer ${rawKey}`, 'jobs:create');
    expect(auth3.authenticated).toBe(true);

    const quoteVal = await validateQuote(quote.quoteId, accountId);
    expect(quoteVal.valid).toBe(true);

    // Atomic credit reservation
    const reserveRes = await reserveCredits(
      accountId,
      quote.totalCredits,
      'job_pilot_001',
      quote.quoteId
    );
    expect(reserveRes.success).toBe(true);

    balance = await getAccountBalance(accountId);
    expect(balance?.reservedCredits).toBe(10);
    expect(balance?.availableCredits).toBe(9_990);

    const job: Job = {
      jobId: 'job_pilot_001',
      accountId,
      serviceId: quote.serviceId,
      quoteId: quote.quoteId,
      state: 'QUEUED',
      financialState: 'CREDITS_RESERVED',
      input: {
        payload: { system: 'GXEON', health: 'OK', agentCount: 42 },
        schema: {
          type: 'object',
          required: ['system', 'health'],
        },
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await store.saveJob(job);

    // 5. GXEON Commander Dispatches -> Worker Leased -> Execution -> QA -> Evidence -> Debit
    const commander = getGxeonCommander();
    const execResult = await commander.processJob(job.jobId);

    expect(execResult.error).toBeUndefined();
    expect(execResult.job.state).toBe('COMPLETED');
    expect(execResult.job.financialState).toBe('CREDITS_SETTLED');
    expect(execResult.job.workerId).toBeDefined();
    expect(execResult.job.evidenceRecordId).toBeDefined();

    // 6. Retrieve Result (GET /v1/jobs/:id/result)
    const auth4 = await authenticateMachineRequest(`Bearer ${rawKey}`, 'results:read');
    expect(auth4.authenticated).toBe(true);

    const finalResult = await store.getJobResult(job.jobId);
    expect(finalResult).toBeDefined();
    expect(finalResult?.state).toBe('COMPLETED');
    expect(finalResult?.results.length).toBeGreaterThan(0);

    // 7. Verify Cryptographic Evidence
    const evidence = await store.getEvidence(job.jobId);
    expect(evidence).toBeDefined();
    expect(evidence?.qaStatus).toBe('PASSED');
    expect(evidence?.inputHash).toBeDefined();
    expect(evidence?.resultHash).toBeDefined();

    // 8. Verify Ledger Invariant & Final Financial State
    balance = await getAccountBalance(accountId);
    expect(balance?.creditBalance).toBe(9_990);
    expect(balance?.reservedCredits).toBe(0);
    expect(balance?.availableCredits).toBe(9_990);
    expect(balance?.spentCredits).toBe(10);

    const ledger = await store.getLedgerEntries(accountId);
    expect(ledger.length).toBe(2);
    expect(ledger[0].type).toBe('RESERVE');
    expect(ledger[1].type).toBe('DEBIT');
    expect(ledger[1].amountCredits).toBe(10);
  });
});

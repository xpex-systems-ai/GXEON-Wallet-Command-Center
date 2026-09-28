import { describe, it, expect, beforeEach } from 'vitest';
import {
  generateApiKey,
  authenticateMachineRequest,
  checkRateLimit,
} from '../../src/agent-economy/auth.js';
import {
  createQuote,
  validateQuote,
} from '../../src/agent-economy/quoteEngine.js';
import {
  creditAccount,
  reserveCredits,
  settleCredits,
  releaseCredits,
  getAccountBalance,
} from '../../src/agent-economy/ledger.js';
import {
  getAgentEconomyStore,
  resetAgentEconomyStoreForTesting,
} from '../../src/agent-economy/store.js';
import { AgentAccount, ApiKeyRecord } from '../../src/agent-economy/types.js';

describe('GXEON Machine Auth, Ledger & Quote Engine Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
  });

  describe('Machine Identity & Auth', () => {
    it('generates secure gxa_live_ keys and stores only hashed credentials', async () => {
      const { rawKey, keyRecord } = generateApiKey();
      expect(rawKey.startsWith('gxa_live_')).toBe(true);
      expect(keyRecord.hashedKey).toBeDefined();
      expect(keyRecord.hashedKey).not.toEqual(rawKey);
      expect(keyRecord.prefix).toBe(rawKey.slice(0, 12));
    });

    it('authenticates valid key and enforces account status and scopes', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_test_01',
        name: 'Autonomous Agent Alpha',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 1000,
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 10000,
        dailyLimit: 2000,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      const { rawKey, keyRecord } = generateApiKey();
      const fullKeyRecord: ApiKeyRecord = {
        ...keyRecord,
        accountId: account.accountId,
        scopes: ['services:read', 'quotes:create', 'jobs:create', 'jobs:read'],
      };
      await store.saveApiKey(fullKeyRecord);

      // 1. Success with permitted scope
      const authOk = await authenticateMachineRequest(
        `Bearer ${rawKey}`,
        'quotes:create'
      );
      expect(authOk.authenticated).toBe(true);
      expect(authOk.context?.account.accountId).toBe(account.accountId);

      // 2. Failure with missing scope
      const authDenied = await authenticateMachineRequest(
        `Bearer ${rawKey}`,
        'results:read'
      );
      expect(authDenied.authenticated).toBe(false);
      expect(authDenied.error?.error.code).toBe('SCOPE_DENIED');

      // 3. Failure on suspended account
      account.status = 'SUSPENDED';
      await store.saveAccount(account);
      const authSuspended = await authenticateMachineRequest(`Bearer ${rawKey}`);
      expect(authSuspended.authenticated).toBe(false);
      expect(authSuspended.error?.error.code).toBe('ACCOUNT_SUSPENDED');

      // 4. Failure on revoked key
      account.status = 'ACTIVE';
      await store.saveAccount(account);
      fullKeyRecord.revokedAt = new Date().toISOString();
      await store.saveApiKey(fullKeyRecord);
      const authRevoked = await authenticateMachineRequest(`Bearer ${rawKey}`);
      expect(authRevoked.authenticated).toBe(false);
      expect(authRevoked.error?.error.code).toBe('INVALID_API_KEY');
    });

    it('enforces sliding-window rate limits (429)', () => {
      const accountId = 'acc_rate_limit_test';
      const limit = 5;

      for (let i = 0; i < limit; i++) {
        const check = checkRateLimit(accountId, 'request', limit);
        expect(check.allowed).toBe(true);
        expect(check.remaining).toBe(limit - 1 - i);
      }

      const blockedCheck = checkRateLimit(accountId, 'request', limit);
      expect(blockedCheck.allowed).toBe(false);
      expect(blockedCheck.remaining).toBe(0);
      expect(blockedCheck.retryAfterSeconds).toBeGreaterThan(0);
    });
  });

  describe('Quote Engine', () => {
    it('creates immutable, server-authoritative quotes with tamper detection', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_quote_test',
        name: 'Quoting Agent',
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

      // Create quote for 10 URLs (unitPrice = 5)
      const res = await createQuote({
        accountId: account.accountId,
        serviceId: 'gxeon_url_verify_v1',
        quantity: 10,
      });

      expect(res.success).toBe(true);
      expect(res.quote).toBeDefined();
      expect(res.quote?.totalCredits).toBe(50); // 10 * 5 = 50
      expect(res.quote?.quoteHash).toBeDefined();

      // Validate valid quote
      const valOk = await validateQuote(res.quote!.quoteId, account.accountId, 10);
      expect(valOk.valid).toBe(true);

      // Tampered quote detection: modify totalCredits directly in store
      const tampered = { ...res.quote!, totalCredits: 10 };
      await store.saveQuote(tampered);
      const valTampered = await validateQuote(res.quote!.quoteId, account.accountId, 10);
      expect(valTampered.valid).toBe(false);
      expect(valTampered.errorCode).toBe('QUOTE_INVALID');
      expect(valTampered.message).toContain('integrity check failed');
    });
  });

  describe('Credit Ledger & Billing Invariants', () => {
    it('executes atomic credit reserve, debit on success, and release on failure', async () => {
      const store = getAgentEconomyStore();
      const account: AgentAccount = {
        accountId: 'acc_ledger_test',
        name: 'Ledger Agent',
        status: 'ACTIVE',
        billingMode: 'PREPAID_CREDITS',
        creditBalance: 100,
        reservedCredits: 0,
        spentCredits: 0,
        spendingLimit: 500,
        dailyLimit: 500,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await store.saveAccount(account);

      // 1. Initial balance check
      let bal = await getAccountBalance(account.accountId);
      expect(bal?.availableCredits).toBe(100);

      // 2. Reserve 40 credits
      const resReserve = await reserveCredits(account.accountId, 40, 'job_1', 'quo_1');
      expect(resReserve.success).toBe(true);
      bal = await getAccountBalance(account.accountId);
      expect(bal?.reservedCredits).toBe(40);
      expect(bal?.availableCredits).toBe(60);

      // 3. Attempt to reserve more than available (70 > 60) -> 402 Insufficient credits
      const resOver = await reserveCredits(account.accountId, 70, 'job_2', 'quo_2');
      expect(resOver.success).toBe(false);
      expect(resOver.error?.error.code).toBe('INSUFFICIENT_CREDITS');

      // 4. Settle 40 credits on success
      const resSettle = await settleCredits(account.accountId, 40, 'job_1', 'quo_1');
      expect(resSettle.success).toBe(true);
      bal = await getAccountBalance(account.accountId);
      expect(bal?.creditBalance).toBe(60);
      expect(bal?.reservedCredits).toBe(0);
      expect(bal?.spentCredits).toBe(40);
      expect(bal?.availableCredits).toBe(60);

      // 5. Reserve and release on failure
      await reserveCredits(account.accountId, 20, 'job_3', 'quo_3');
      bal = await getAccountBalance(account.accountId);
      expect(bal?.reservedCredits).toBe(20);
      expect(bal?.availableCredits).toBe(40);

      await releaseCredits(account.accountId, 20, 'job_3', 'quo_3');
      bal = await getAccountBalance(account.accountId);
      expect(bal?.reservedCredits).toBe(0);
      expect(bal?.availableCredits).toBe(60);

      // 6. Verify ledger entries are append-only
      const entries = await store.getLedgerEntries(account.accountId);
      expect(entries.length).toBe(4); // RESERVE, DEBIT, RESERVE, RELEASE
      expect(entries[0].type).toBe('RESERVE');
      expect(entries[1].type).toBe('DEBIT');
      expect(entries[2].type).toBe('RESERVE');
      expect(entries[3].type).toBe('RELEASE');
    });
  });
});

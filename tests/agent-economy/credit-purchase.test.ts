import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import Stripe from 'stripe';
import topup, { TOPUP_PACKS } from '../../api/v1/billing/topup.js';
import mcp from '../../api/v1/mcp.js';
import { VercelStripeService, type PaymentStore } from '../../api/_stripe.js';
import { FirestoreRestClient } from '../../api/_firestoreRest.js';
import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { FirestoreAgentEconomyStore, getAgentEconomyStore, resetAgentEconomyStoreForTesting } from '../../src/agent-economy/store.js';
import { handleMcpRpc } from '../../src/agent-economy/mcpGateway.js';
import { reserveCredits } from '../../src/agent-economy/ledger.js';
import type { AgentAccount } from '../../src/agent-economy/types.js';

const mocks = vi.hoisted(() => ({ create: vi.fn(), list: vi.fn() }));
vi.mock('stripe', async importOriginal => {
  const actual = await importOriginal<typeof import('stripe')>();
  return { default: class extends actual.default {
    constructor(key: string) { super(key); this.checkout.sessions.create = mocks.create; this.checkout.sessions.list = mocks.list; }
  } };
});

const testSecret = 'whsec_local_unit_test_only';
const seed: AgentAccount = {
  accountId: 'acc_unit', name: 'Unit test', status: 'ACTIVE', billingMode: 'PREPAID_CREDITS',
  creditBalance: 0, reservedCredits: 0, spentCredits: 0, spendingLimit: 2000, dailyLimit: 2000,
  createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
};
const purchase = {
  accountId: seed.accountId, sessionId: 'cs_test_unit', eventId: 'evt_unit', paymentIntentId: 'pi_unit',
  packId: 'pack_100', credits: 100, amountCents: 2000, currency: 'brl' as const, livemode: false,
};

function response() {
  const headers: Record<string, string> = {};
  return {
    statusCode: 200, headers, body: undefined as any,
    setHeader(name: string, value: string) { headers[name] = value; },
    end(value?: string) { this.body = value ? JSON.parse(value) : undefined; },
  };
}
function paymentStore(): PaymentStore {
  const events = new Set<string>();
  return {
    getOrder: vi.fn().mockResolvedValue(null), createOrderIfAbsent: vi.fn(), updateOrder: vi.fn(),
    getProcessedEvent: async id => events.has(id), commitPaymentSuccess: vi.fn(), commitRefund: vi.fn(),
    recordEventIfAbsent: async id => { const exists = events.has(id); events.add(id); return exists ? 'DUPLICATE' : 'COMMITTED'; },
    getOrderIdByPaymentIntent: vi.fn().mockResolvedValue(null),
  };
}
function event(id: string, type = 'checkout.session.completed', session: Record<string, unknown> = {}) {
  return {
    id, type, livemode: false,
    data: { object: {
      id: purchase.sessionId, livemode: false, payment_status: 'paid', currency: 'brl', amount_total: 2000,
      payment_intent: 'pi_unit', metadata: {
        service_id: 'agent_credit_topup', account_id: seed.accountId, credits: '100', pack_id: 'pack_100',
      }, ...session,
    } },
  };
}
async function deliver(service: VercelStripeService, value: ReturnType<typeof event>) {
  const payload = JSON.stringify(value);
  const signature = Stripe.webhooks.generateTestHeaderString({ payload, secret: testSecret });
  return service.handleWebhook(payload, signature);
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubEnv('STRIPE_SECRET_KEY', 'sk_test_unit_only');
  vi.stubEnv('GXEON_AGENT_MARKET_ENABLED', 'true');
  resetAgentEconomyStoreForTesting();
  mocks.create.mockReset().mockResolvedValue({ id: 'cs_test_checkout', url: 'https://checkout.stripe.com/c/pay/cs_test_checkout' });
  mocks.list.mockReset().mockResolvedValue({ data: [{ id: purchase.sessionId, metadata: { service_id: 'agent_credit_topup' } }] });
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe('Credit purchase onboarding', () => {
  it('publishes six prepaid packs with lower entry pricing and non-increasing unit cost', () => {
    const packs = Object.values(TOPUP_PACKS);
    expect(packs.map(pack => pack.id)).toEqual([
      'pack_20', 'pack_50', 'pack_100', 'pack_250', 'pack_500', 'pack_2000',
    ]);
    expect(packs.map(pack => pack.priceCents)).toEqual([490, 1190, 2000, 4500, 8000, 25000]);
    const unitCosts = packs.map(pack => pack.priceCents / pack.credits);
    for (let i = 1; i < unitCosts.length; i++) {
      expect(unitCosts[i]).toBeLessThanOrEqual(unitCosts[i - 1] + Number.EPSILON);
    }
  });

  it('publishes micro packs and creates a R$4.90 NANO checkout without granting credits early', async () => {
    const res = response();
    await topup({ method: 'POST', headers: {}, body: { packId: 'pack_20', name: 'Nano Buyer' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.pack).toMatchObject({ id: 'pack_20', credits: 20, priceCents: 490, currency: 'brl' });
    expect(res.body.apiKey).toMatch(/^gxa_live_/);
    const auth = await authenticateMachineRequest('Bearer ' + res.body.apiKey);
    expect(auth.context?.account.creditBalance).toBe(0);
    const params = mocks.create.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(490);
    expect(params.metadata.credits).toBe('20');
    expect(params.metadata.pack_id).toBe('pack_20');
  });

  it('lets authenticated agents discover prepaid packs over MCP without creating payment state', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount({ ...seed, creditBalance: 20 });
    const result = await handleMcpRpc({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'list_credit_packs', arguments: {} },
    }, seed.accountId);
    const payload = JSON.parse((result.result as any).content[0].text);
    expect(payload.topupEndpoint).toBe('/v1/billing/topup');
    expect(payload.packs.map((pack: any) => pack.id)).toContain('pack_20');
    expect(payload.packs.find((pack: any) => pack.id === 'pack_20').priceCents).toBe(490);
    expect(payload.moneyTruth).toContain('not payment');
  });

  it('creates a zero-balance account with a hashed buyer key and returns a checkout', async () => {
    const res = response();
    await topup({ method: 'POST', headers: {}, body: { packId: 'pack_100', name: 'Buyer' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.headers['Cache-Control']).toBe('no-store');
    expect(res.body.apiKey).toMatch(/^gxa_live_/);
    const auth = await authenticateMachineRequest('Bearer ' + res.body.apiKey);
    expect(auth.context?.account.creditBalance).toBe(0);
    expect(auth.context?.apiKey.hashedKey).not.toBe(res.body.apiKey);
    expect(auth.context?.apiKey.scopes).not.toContain('admin:*');
    const params = mocks.create.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(2000);
    expect(params.metadata.account_id).toBe(res.body.targetAccountId);
    expect(params.payment_method_types).toBeUndefined();
    expect(params.success_url).toContain('/credits?status=returned');
  });

  it.each(['__proto__', 'constructor', 'unknown'])('rejects invalid pack %s before Stripe', async packId => {
    const res = response();
    await topup({ method: 'POST', headers: {}, body: { packId, name: 'Buyer' } }, res);
    expect(res.statusCode).toBe(400);
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('does not fund an arbitrary account or downgrade invalid credentials to anonymous', async () => {
    for (const request of [
      { headers: {}, body: { packId: 'pack_100', accountId: seed.accountId } },
      { headers: { authorization: 'Bearer invalid' }, body: { packId: 'pack_100', name: 'Buyer' } },
    ]) {
      const res = response();
      await topup({ method: 'POST', ...request }, res);
      expect(res.statusCode).toBe(401);
    }
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it('allows a buyer to recharge only the authenticated account', async () => {
    const first = response();
    await topup({ method: 'POST', headers: {}, body: { packId: 'pack_100', name: 'Buyer' } }, first);
    const res = response();
    const headers = { authorization: 'Bearer ' + first.body.apiKey };
    await topup({ method: 'POST', headers, body: { packId: 'pack_500' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.targetAccountId).toBe(first.body.targetAccountId);
    expect(res.body.apiKey).toBeUndefined();
    const rejected = response();
    await topup({ method: 'POST', headers, body: { packId: 'pack_500', accountId: 'acc_someone_else' } }, rejected);
    expect(rejected.statusCode).toBe(403);
  });
});

describe('Signed credit payment fulfillment', () => {
  it('reverses partial then full refunds once, even when credits have already been spent', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount(seed);
    await store.commitCreditPurchase(purchase);
    const service = new VercelStripeService({ store: paymentStore(), webhookSecret: testSecret });
    const refund = (id: string, amount: number) => event(id, 'charge.refunded', {
      id: 'ch_unit', payment_intent: purchase.paymentIntentId, amount_refunded: amount,
      metadata: { service_id: 'agent_credit_topup' },
    });
    expect((await deliver(service, refund('evt_partial', 1000))).status).toBe('REFUNDED');
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(50);
    await store.saveAccount({ ...(await store.getAccount(seed.accountId))!, creditBalance: 10, spentCredits: 40 });
    expect((await deliver(service, refund('evt_full', 2000))).status).toBe('REFUNDED');
    await deliver(service, refund('evt_full_again', 2000));
    await deliver(service, refund('evt_old_partial', 1000));
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(-40);
    expect((await reserveCredits(seed.accountId, 2, 'job_after_refund', 'quote_unit')).success).toBe(false);
  });

  it('retries a refund that arrives before fulfillment instead of forgetting it', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount(seed);
    await expect(store.refundCreditPurchase(purchase.sessionId, 2000, 'ch_unit')).rejects.toThrow('not yet fulfilled');
    await store.commitCreditPurchase(purchase);
    expect(await store.refundCreditPurchase(purchase.sessionId, 2000, 'ch_unit')).toBe('COMMITTED');
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(0);
  });

  it('credits a paid session once across retries, concurrent delivery and different event types', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount(seed);
    const service = new VercelStripeService({ store: paymentStore(), webhookSecret: testSecret });
    const results = await Promise.all([
      deliver(service, event('evt_one')),
      deliver(service, event('evt_one')),
      deliver(service, event('evt_two', 'checkout.session.async_payment_succeeded')),
    ]);
    expect(results.every(result => result.processed)).toBe(true);
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(100);
    expect(await store.getLedgerEntries(seed.accountId)).toHaveLength(1);
  });

  it('waits for a delayed payment and survives a failure recording the event after the credit commit', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount(seed);
    const payments = paymentStore();
    const service = new VercelStripeService({ store: payments, webhookSecret: testSecret });
    expect((await deliver(service, event('evt_pending', undefined, { payment_status: 'unpaid' }))).status).toBe('UNPAID');
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(0);
    const record = payments.recordEventIfAbsent;
    payments.recordEventIfAbsent = vi.fn().mockRejectedValueOnce(new Error('temporary storage failure')).mockImplementation(record);
    await expect(deliver(service, event('evt_paid', 'checkout.session.async_payment_succeeded'))).rejects.toThrow();
    expect((await deliver(service, event('evt_paid', 'checkout.session.async_payment_succeeded'))).processed).toBe(true);
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(100);
  });

  it.each([
    { amount_total: 1 }, { currency: 'usd' }, { payment_intent: null },
    { metadata: { service_id: 'agent_credit_topup', account_id: seed.accountId, credits: '9999', pack_id: 'pack_100' } },
  ])('rejects mismatched signed payment data %j', async session => {
    const store = getAgentEconomyStore();
    await store.saveAccount(seed);
    const service = new VercelStripeService({ store: paymentStore(), webhookSecret: testSecret });
    expect((await deliver(service, event('evt_invalid', undefined, session))).processed).toBe(false);
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(0);
  });

  it('rejects invalid signatures and test-mode events in production', async () => {
    const service = new VercelStripeService({ store: paymentStore(), webhookSecret: testSecret });
    expect((await service.handleWebhook('{}', 'invalid')).status).toBe('UNVERIFIED_SIGNATURE');
    vi.stubEnv('NODE_ENV', 'production');
    expect((await deliver(service, event('evt_test_in_production'))).processed).toBe(false);
  });
});

describe('Production storage and paid execution', () => {
  it.each(['2025-03-26', '2025-06-18', '2025-11-25'])('negotiates the supported MCP version %s', async protocolVersion => {
    const result = await handleMcpRpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion } }, seed.accountId);
    expect(result.result).toMatchObject({ protocolVersion });
  });

  it('commits refunds and their receipt watermark against both current revisions', async () => {
    vi.spyOn(FirestoreRestClient.prototype, 'get').mockImplementation(async collection =>
      collection === 'credit_ledger'
        ? { data: { accountId: seed.accountId, stripePurchase: purchase, refundedCents: 0 }, updateTime: 'receipt-revision' }
        : { data: { ...seed, creditBalance: 100 }, updateTime: 'account-revision' });
    const commit = vi.spyOn(FirestoreRestClient.prototype, 'conditionalCommit').mockResolvedValue('COMMITTED');
    expect(await new FirestoreAgentEconomyStore().refundCreditPurchase(purchase.sessionId, 2000, 'ch_unit')).toBe('COMMITTED');
    const writes = commit.mock.calls[0][0];
    expect(writes.map(write => write.currentDocument)).toEqual([
      { updateTime: 'account-revision' }, { updateTime: 'receipt-revision' }, { exists: false },
    ]);
  });

  it('commits the receipt and balance together with a snapshot precondition and retries conflicts', async () => {
    const get = vi.spyOn(FirestoreRestClient.prototype, 'get').mockImplementation(async collection =>
      collection === 'credit_ledger' ? null : { data: { ...seed }, updateTime: '2026-01-01T00:00:00.000001Z' });
    const commit = vi.spyOn(FirestoreRestClient.prototype, 'conditionalCommit').mockResolvedValueOnce('CONFLICT').mockResolvedValueOnce('COMMITTED');
    const store = new FirestoreAgentEconomyStore();
    expect(await store.commitCreditPurchase(purchase)).toBe('COMMITTED');
    const writes = commit.mock.calls[0][0];
    expect(writes).toHaveLength(2);
    expect(writes[0].currentDocument).toEqual({ updateTime: '2026-01-01T00:00:00.000001Z' });
    expect(writes[1].currentDocument).toEqual({ exists: false });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(get).toHaveBeenCalledTimes(4);
  });

  it('never overwrites a concurrent account balance with a stale ledger snapshot', async () => {
    vi.spyOn(FirestoreRestClient.prototype, 'get').mockResolvedValue({ data: { ...seed }, updateTime: 'revision-one' });
    const commit = vi.spyOn(FirestoreRestClient.prototype, 'conditionalCommit').mockResolvedValue('CONFLICT');
    const store = new FirestoreAgentEconomyStore();
    const account = (await store.getAccount(seed.accountId))!;
    account.creditBalance = 100;
    await expect(store.commitLedgerTransaction(account, {
      ledgerEntryId: 'unit', accountId: seed.accountId, type: 'CREDIT', amountCredits: 100,
      balanceBefore: 0, balanceAfter: 100, timestamp: seed.createdAt,
    })).rejects.toThrow();
    expect(commit.mock.calls[0][0][0].currentDocument).toEqual({ updateTime: 'revision-one' });
  });

  it('loads the real production worker registry instead of returning an empty queue', async () => {
    const create = vi.spyOn(FirestoreRestClient.prototype, 'createIfAbsent').mockResolvedValue({ created: true, document: { data: {} } });
    vi.spyOn(FirestoreRestClient.prototype, 'listStrict').mockResolvedValue([{ data: { workerId: 'registered' } }]);
    expect(await new FirestoreAgentEconomyStore().listWorkers()).toEqual([{ workerId: 'registered' }]);
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('executes direct JSON MCP through the ledger and refuses further work after the balance is spent', async () => {
    const store = getAgentEconomyStore();
    await store.saveAccount({ ...seed, creditBalance: 2 });
    const request = { jsonrpc: '2.0' as const, id: 1, method: 'tools/call', params: {
      name: 'gxeon_json_validate_v1', arguments: { payload: { ok: true }, schema: { type: 'object' } },
    } };
    const result = await handleMcpRpc(request, seed.accountId);
    expect((result.result as any).isError).toBe(false);
    expect((await store.getAccount(seed.accountId))?.creditBalance).toBe(0);
    expect((await store.getLedgerEntries(seed.accountId)).map(entry => entry.type)).toEqual(['RESERVE', 'DEBIT']);
    expect((await handleMcpRpc(request, seed.accountId)).result).toMatchObject({ isError: true });
    expect((await reserveCredits(seed.accountId, 2, 'job_unit', 'quote_unit')).success).toBe(false);
  });

  it('isolates storefront buyer keys from operator marketplace tools', async () => {
    const first = response();
    await topup({ method: 'POST', headers: {}, body: { packId: 'pack_100', name: 'Buyer' } }, first);
    const headers = { authorization: 'Bearer ' + first.body.apiKey };
    const listing = response();
    await mcp({ method: 'POST', headers, body: { jsonrpc: '2.0', id: 1, method: 'tools/list' } }, listing);
    expect(listing.body.result.tools.some((tool: any) => tool.name.startsWith('bounty_') || tool.name.startsWith('taskmarket_'))).toBe(false);
    const denied = response();
    await mcp({ method: 'POST', headers, body: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'bounty_marketplace_call' } } }, denied);
    expect(denied.statusCode).toBe(403);
  });
});

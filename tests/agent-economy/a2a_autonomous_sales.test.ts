import { generateKeyPairSync, verify } from 'node:crypto';
import { getVercelOidcToken } from '@vercel/oidc';
import { afterEach, describe, it, expect, beforeEach, vi } from 'vitest';
import { encodeAbiParameters, encodeEventTopics, parseAbiItem, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import {
  GxeonScout,
  GxeonQualifier,
  GxeonPricingAgent,
  GxeonOfferAgent,
  GxeonNegotiationEngine,
  GxeonRetentionAgent,
  AutonomousCandidate,
} from '../../src/agent-economy/autonomous/index.js';
import { handleX402CapabilityExecution } from '../../src/agent-economy/x402/middleware.js';
import { getX402Price } from '../../src/agent-economy/x402/pricing.js';
import { createX402Receipt } from '../../src/agent-economy/x402/receipt.js';
import { getX402Readiness } from '../../src/agent-economy/x402/readiness.js';
import { resetAgentEconomyStoreForTesting, getAgentEconomyStore } from '../../src/agent-economy/store.js';
import {
  generateTreasuryChallenge,
  verifyTreasurySignature,
  FORBIDDEN_EXAMPLE_ADDRESS,
} from '../../src/agent-economy/x402/treasuryVerifier.js';

vi.mock('@vercel/oidc', () => ({ getVercelOidcToken: vi.fn() }));

const TEST_OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const testAccount = privateKeyToAccount(TEST_OPERATOR_KEY);
const TEST_OPERATOR_ADDRESS = testAccount.address;
const buyer = '0x1111111111111111111111111111111111111111';
const asset = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const txHash = ('0x' + 'ab'.repeat(32)) as Hex;
const nonce = ('0x' + 'c1'.repeat(32)) as Hex;
const authEvent = parseAbiItem('event AuthorizationUsed(address indexed authorizer, bytes32 indexed nonce)');
const transferEvent = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const payaiEdge = 'https://hklixvnakprhejtdghns.supabase.co/functions/v1/gxeon-payai';

function mockSettlement(options: {
  status?: 'pending' | 'unfinalized' | 'confirmed' | 'unmatched';
  lostResponse?: boolean;
  rejectedKey?: boolean;
  edgeMode?: 'wallet' | 'merchant' | 'misconfigured';
} = {}) {
  let status = options.status ?? 'confirmed';
  const log = { address: asset, transactionHash: txHash, blockHash: txHash, blockNumber: '0x11', transactionIndex: '0x0', removed: false };
  const authorizationLog = {
    ...log, logIndex: '0x0', data: '0x',
    topics: encodeEventTopics({ abi: [authEvent], args: { authorizer: buyer, nonce } }),
  };
  const transferLog = {
    ...log, logIndex: '0x1', data: encodeAbiParameters([{ type: 'uint256' }], [10_000n]),
    topics: encodeEventTopics({ abi: [transferEvent], args: { from: buyer, to: TEST_OPERATOR_ADDRESS } }),
  };
  const fetch = vi.fn(async (input: string | Request | URL, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const usesEdge = options.edgeMode !== undefined && url.origin + url.pathname === payaiEdge;
    if (usesEdge) {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-vercel-oidc');
      if (init?.method === 'GET') return Response.json({ mode: options.edgeMode });
    }
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : await (input as Request).json();
    if (usesEdge || url.hostname === 'facilitator.payai.network') {
      expect(body.x402Version).toBe(2);
      expect(body.paymentRequirements.payTo).toBe(TEST_OPERATOR_ADDRESS);
      if (options.rejectedKey) return Response.json({ isValid: false }, { status: 401 });
      const operation = usesEdge ? url.searchParams.get('operation') : url.pathname.slice(1);
      if (operation === 'verify') return Response.json({ isValid: true, payer: buyer });
      expect(operation).toBe('settle');
      if (options.lostResponse) throw new Error('Simulated facilitator timeout');
      return Response.json({ success: true, transaction: txHash, network: 'eip155:8453', payer: buyer });
    }
    const rpcResult: Record<string, unknown> = {
      eth_chainId: '0x2105',
      eth_blockNumber: '0x11',
      eth_getBlockByNumber: {
        number: body.params?.[0] === 'finalized' && status === 'unfinalized' ? '0x10' : '0x11',
        hash: txHash,
        transactions: [],
      },
      eth_getLogs: status === 'pending' ? [] : [authorizationLog],
      eth_getTransactionReceipt: status === 'pending' ? null : {
        ...log, status: '0x1', type: '0x2', from: buyer, to: asset,
        cumulativeGasUsed: '0x1', gasUsed: '0x1', effectiveGasPrice: '0x1',
        logs: status === 'unmatched' ? [authorizationLog] : [authorizationLog, transferLog],
      },
    };
    expect(body.method in rpcResult).toBe(true);
    return Response.json({ jsonrpc: '2.0', id: body.id, result: rpcResult[body.method] });
  });
  vi.stubGlobal('fetch', fetch);
  return { fetch, confirm: () => { status = 'confirmed'; } };
}

async function paidRequest(serviceId = 'gxeon_json_validate_v1', input: unknown = { payload: { healthy: true } }) {
  const path = serviceId === 'gxeon_csv_audit_v1' ? '/x402/csv-audit' : '/x402/json-validate';
  const resourceUrl = 'https://gxeon-wallet-command-center.vercel.app' + path;
  const challenge = await handleX402CapabilityExecution({ serviceId, input, resourceUrl, headers: {} });
  expect(challenge.statusCode).toBe(402);
  const { resource, accepts } = JSON.parse(Buffer.from(challenge.headers['PAYMENT-REQUIRED'], 'base64').toString());
  expect(resource.url).toBe(resourceUrl);
  const now = Math.floor(Date.now() / 1000);
  const packet = {
    x402Version: 2, resource, accepted: accepts[0],
    payload: {
      // The facilitator verification and Base receipt are mocked in these tests.
      signature: '0x' + 'a1'.repeat(65),
      authorization: {
        from: buyer, to: TEST_OPERATOR_ADDRESS, value: accepts[0].amount,
        validAfter: String(now - 1), validBefore: String(now + 59), nonce,
      },
    },
  };
  return {
    serviceId, input, resourceUrl,
    headers: { 'payment-signature': Buffer.from(JSON.stringify(packet)).toString('base64') },
  };
}

describe('GXEON-GLOBAL-MACHINE-REVENUE-001 Autonomous Machine-to-Machine Sales Test Suite', () => {
  beforeEach(async () => {
    resetAgentEconomyStoreForTesting();
    vi.stubEnv('GXEON_AGENT_MARKET_ENABLED', 'true');
    vi.stubEnv('GXEON_X402_BASE_PAYTO', TEST_OPERATOR_ADDRESS);
    vi.stubEnv('GXEON_TREASURY_CHALLENGE_SECRET', 'ab'.repeat(32));
    vi.stubEnv('GXEON_TREASURY_VERIFIED', 'true');
    vi.stubEnv('GXEON_AUTONOMOUS_SELLING_ENABLED', 'true');
    vi.stubEnv('GXEON_X402_FACILITATOR', 'payai');
    vi.stubEnv('GXEON_PAYAI_EDGE_URL', '');
    vi.stubEnv('PAYAI_API_KEY_ID', '');
    vi.stubEnv('PAYAI_API_KEY_SECRET', '');
    const { challenge } = generateTreasuryChallenge(TEST_OPERATOR_ADDRESS);
    const signature = await testAccount.signMessage({ message: challenge });
    expect((await verifyTreasurySignature({ address: TEST_OPERATOR_ADDRESS, challenge, signature })).verified).toBe(true);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.mocked(getVercelOidcToken).mockReset();
  });


  describe('GXEON_QUALIFIER & Fit Scoring', () => {
    const qualifier = new GxeonQualifier();

    it('qualifies high-fit machine candidate with fitScore >= 80', () => {
      const candidate: AutonomousCandidate = {
        opportunityId: 'opp_valid_001',
        source: 'x402_bazaar',
        resourceUrl: 'https://x402.example.com/check',
        serviceName: 'JSON Validator Bot',
        description: 'Auto JSON check',
        observedPrice: 0.01,
        observedCurrency: 'USDC',
        calls30d: 15,
        uniquePayers30d: 4,
        compatibleCapability: 'gxeon_json_validate_v1',
        fitScore: 0,
        machineContactMethod: 'x402',
        status: 'DISCOVERED',
        discoveredAt: new Date().toISOString(),
      };

      const result = qualifier.qualifyCandidate(candidate);
      expect(result.fitScore).toBeGreaterThanOrEqual(80);
      expect(result.qualified).toBe(true);

      const advanced = qualifier.processAndAdvance(candidate);
      expect(advanced.status).toBe('QUALIFIED');
    });

    it('rejects candidate with incompatible capability (fitScore < 80)', () => {
      const candidate: AutonomousCandidate = {
        opportunityId: 'opp_incompatible',
        source: 'public_api',
        resourceUrl: 'https://api.example.com/unsupported',
        serviceName: 'Unsupported Audio Transcriber',
        description: 'Transcribes voice to audio',
        observedPrice: 5.0,
        compatibleCapability: 'NONE',
        fitScore: 0,
        machineContactMethod: 'rest_api',
        status: 'DISCOVERED',
        discoveredAt: new Date().toISOString(),
      };

      const result = qualifier.qualifyCandidate(candidate);
      expect(result.fitScore).toBeLessThan(80);
      expect(result.qualified).toBe(false);

      const advanced = qualifier.processAndAdvance(candidate);
      expect(advanced.status).toBe('REJECTED');
    });
  });

  describe('GXEON_PRICING_AGENT Floor & Guardrails', () => {
    const pricing = new GxeonPricingAgent();

    it('strictly enforces minimum floor pricing (never free, never below floor)', () => {
      const jsonPrice = pricing.calculatePrice({
        serviceId: 'gxeon_json_validate_v1',
        quantity: 1,
        currency: 'credits',
      });
      expect(jsonPrice.unitPrice).toBeGreaterThanOrEqual(2);
      expect(jsonPrice.total).toBe(2);

      const urlPriceUsdc = pricing.calculatePrice({
        serviceId: 'gxeon_url_verify_v1',
        quantity: 1,
        currency: 'USDC',
      });
      expect(urlPriceUsdc.unitPrice).toBeGreaterThanOrEqual(0.025);
      expect(urlPriceUsdc.total).toBe(0.025);
    });

    it('caps volume discounts strictly without breaching floor', () => {
      const bulkOrder = pricing.calculatePrice({
        serviceId: 'gxeon_url_verify_v1',
        quantity: 10000,
        currency: 'credits',
        buyerVolumeLifetime: 50000,
      });

      expect(bulkOrder.appliedDiscountPercent).toBeLessThanOrEqual(30);
      expect(bulkOrder.unitPrice).toBeGreaterThanOrEqual(5); // Floor for URL verify is 5
      expect(bulkOrder.total).toBe(50000);
    });
  });

  describe('GXEON_OFFER_AGENT & Negotiation Engine', () => {
    const offerAgent = new GxeonOfferAgent();
    const negotiation = new GxeonNegotiationEngine();

    it('creates binding machine-readable capability offers', () => {
      const offer = offerAgent.createOffer({
        buyerAgentId: 'agent_alpha',
        requestedCapability: 'gxeon_json_validate_v1',
        quantity: 10,
        currency: 'credits',
      });

      expect(offer.offerId.startsWith('off_')).toBe(true);
      expect(offer.seller).toBe('GXEON');
      expect(offer.serviceId).toBe('gxeon_json_validate_v1');
      expect(offer.quantity).toBe(10);
      expect(offer.total).toBe(20);
      expect(offer.paymentMethods).toContain('x402');
      expect(offer.paymentMethods).toContain('prepaid_credits');
    });

    it('accepts valid negotiation within bounds and rejects attempts to breach floor', () => {
      const offer = offerAgent.createOffer({
        buyerAgentId: 'agent_beta',
        requestedCapability: 'gxeon_url_verify_v1',
        quantity: 100,
        currency: 'credits',
      });

      // 1. Attempt to negotiate below minimum floor (url verify floor is 5)
      const lowBall = negotiation.negotiateOffer(offer, {
        offerId: offer.offerId,
        requestedQuantity: 100,
        requestedUnitPrice: 1, // Illegal under floor
      });
      expect(lowBall.accepted).toBe(false);
      expect(lowBall.reason).toContain('immutable capability floor');
      expect(lowBall.counterOffer?.unitPrice).toBeGreaterThanOrEqual(5);

      // 2. Attempt to exceed max batch (url verify max batch is 500)
      const excessiveBatch = negotiation.negotiateOffer(offer, {
        offerId: offer.offerId,
        requestedQuantity: 2000,
        requestedUnitPrice: 5,
      });
      expect(excessiveBatch.accepted).toBe(false);
      expect(excessiveBatch.reason).toContain('exceeds maximum batch limit');
      expect(excessiveBatch.counterOffer?.quantity).toBe(500);

      // 3. Valid negotiation
      const validNegotiation = negotiation.negotiateOffer(offer, {
        offerId: offer.offerId,
        requestedQuantity: 200,
        requestedUnitPrice: 5,
      });
      expect(validNegotiation.accepted).toBe(true);
      expect(validNegotiation.counterOffer?.total).toBe(1000);
    });
  });

  describe('GXEON_RETENTION_AGENT Lifetime Tracking', () => {
    const retention = new GxeonRetentionAgent();

    it('tracks machine customer lifetime revenue and upgrades tier', () => {
      const customerId = 'machine_agent_omega';

      retention.recordJobCompletion({
        machineCustomerId: customerId,
        serviceId: 'gxeon_json_validate_v1',
        revenueCredits: 10,
        revenueUsdc: 0.05,
      });

      let profile = retention.getProfile(customerId);
      expect(profile).toBeDefined();
      expect(profile?.jobsPurchased).toBe(1);
      expect(profile?.retentionTier).toBe('NEW');

      // Second purchase upgrades to ACTIVE
      retention.recordJobCompletion({
        machineCustomerId: customerId,
        serviceId: 'gxeon_json_validate_v1',
        revenueCredits: 20,
        revenueUsdc: 0.10,
      });

      profile = retention.getProfile(customerId);
      expect(profile?.jobsPurchased).toBe(2);
      expect(profile?.retentionTier).toBe('ACTIVE');
    });
  });

  describe('Canonical x402 V2 Seller Protocol & Atomic Settlement', () => {
    it('returns HTTP 402 Challenge with canonical V2 PAYMENT-REQUIRED header when payment proof is missing', async () => {
      const challengeRes = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { payload: { status: 'healthy' } },
        headers: {},
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(challengeRes.statusCode).toBe(402);
      expect(challengeRes.headers['PAYMENT-REQUIRED']).toBeDefined();
      expect(challengeRes.headers['X-402-Version']).toBe('2');

      const body = challengeRes.body as any;
      expect(body.status).toBe(402);
      expect(body.title).toBe('Payment Required');
      expect(Array.isArray(body.accepts)).toBe(true);
      expect(body.accepts[0].network).toBe('eip155:8453');
      expect(body.accepts[0].amount).toBe('10000'); // 0.01 USDC
      expect(body.accepts[0].payTo).toBe(TEST_OPERATOR_ADDRESS);

      // Verify canonical Base64 transport
      const decodedBase64 = JSON.parse(
        Buffer.from(challengeRes.headers['PAYMENT-REQUIRED'], 'base64').toString('utf8')
      );
      expect(decodedBase64.status).toBe(402);
      expect(decodedBase64.accepts[0].payTo).toBe(TEST_OPERATOR_ADDRESS);
    });

    it('cryptographically verifies treasury ownership and persists proof in store', async () => {
      const challengeInfo = generateTreasuryChallenge(TEST_OPERATOR_ADDRESS);
      expect(challengeInfo.challenge.startsWith('GXEON-TREASURY:')).toBe(true);
      expect(challengeInfo.challengeHash).toBeDefined();

      const signature = await testAccount.signMessage({
        message: challengeInfo.challenge,
      });

      const verifyResult = await verifyTreasurySignature({
        address: TEST_OPERATOR_ADDRESS,
        challenge: challengeInfo.challenge,
        signature,
      });

      expect(verifyResult.verified).toBe(true);
      expect(verifyResult.recoveredAddress?.toLowerCase()).toBe(TEST_OPERATOR_ADDRESS.toLowerCase());

      const store = getAgentEconomyStore();
      const persisted = await store.getTreasuryVerification(TEST_OPERATOR_ADDRESS);
      expect(persisted).toBeDefined();
      expect(persisted?.signature).toBe(signature);
    });

    it('strictly forbids example address 0x209693bc6afc0c5328ba36faf03c514ef312287c', async () => {
      expect(() => generateTreasuryChallenge(FORBIDDEN_EXAMPLE_ADDRESS)).toThrow(/SECURITY VIOLATION/);

      const badVerify = await verifyTreasurySignature({
        address: FORBIDDEN_EXAMPLE_ADDRESS,
        challenge: 'GXEON-TREASURY:123:456',
        signature: '0xmock',
      });
      expect(badVerify.verified).toBe(false);
      expect(badVerify.error).toContain('forbidden');

      process.env.GXEON_X402_BASE_PAYTO = FORBIDDEN_EXAMPLE_ADDRESS;
      const res = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { rawJson: '{"test":true}' },
        headers: {},
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });
      expect(res.statusCode).toBe(503);
      expect((res.body as any).error).toBe('TREASURY_NOT_CONFIGURED');
    });

    it('fails closed with 503 when treasury ownership is unverified', async () => {
      process.env.GXEON_TREASURY_VERIFIED = 'false';

      const res = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { rawJson: '{"test":true}' },
        headers: {},
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(res.statusCode).toBe(503);
      expect((res.body as any).error).toBe('TREASURY_NOT_CONFIGURED');
    });


    it('uses the Supabase PayAI bridge for status, verification and settlement with a scoped OIDC token', async () => {
      vi.stubEnv('GXEON_PAYAI_EDGE_URL', payaiEdge);
      vi.mocked(getVercelOidcToken).mockResolvedValue('test-vercel-oidc');
      const { fetch } = mockSettlement({ edgeMode: 'merchant' });
      expect(await getX402Readiness()).toMatchObject({
        enabled: true, facilitatorAuthentication: 'merchant_configured', facilitatorCredentialSource: 'supabase',
      });

      const result = await handleX402CapabilityExecution(await paidRequest());

      expect(result.statusCode).toBe(200);
      const settlements = fetch.mock.calls.filter(([url]) => String(url).startsWith(payaiEdge + '?'));
      expect(settlements.map(([url]) => new URL(String(url)).searchParams.get('operation'))).toEqual(['verify', 'settle']);
      expect(fetch.mock.calls.some(([url]) => String(url).startsWith('https://facilitator.payai.network'))).toBe(false);
      expect(vi.mocked(getVercelOidcToken).mock.calls.every(([options]) => options?.audience === payaiEdge)).toBe(true);
    });

    it('accepts the Supabase wallet mode and pauses if only part of a merchant key pair is configured', async () => {
      vi.stubEnv('GXEON_PAYAI_EDGE_URL', payaiEdge);
      vi.mocked(getVercelOidcToken).mockResolvedValue('test-vercel-oidc');
      mockSettlement({ edgeMode: 'wallet' });
      expect(await getX402Readiness()).toMatchObject({
        enabled: true, facilitatorAuthentication: 'wallet', facilitatorCredentialSource: 'supabase',
      });
      mockSettlement({ edgeMode: 'misconfigured' });
      expect(await getX402Readiness()).toMatchObject({ enabled: false, error: 'FACILITATOR_AUTH_NOT_CONFIGURED' });
    });

    it('signs PayAI verification and settlement separately with the configured merchant key', async () => {
      const { privateKey, publicKey } = generateKeyPairSync('ed25519');
      const keyId = 'test-merchant-key';
      const secret = privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
      vi.stubEnv('PAYAI_API_KEY_ID', keyId);
      vi.stubEnv('PAYAI_API_KEY_SECRET', 'payai_sk_' + secret);
      const { fetch } = mockSettlement();

      const result = await handleX402CapabilityExecution(await paidRequest());

      expect(result.statusCode).toBe(200);
      expect(JSON.stringify(result)).not.toContain(keyId);
      const calls = fetch.mock.calls.filter(([url]) => String(url).startsWith('https://facilitator.payai.network/'));
      expect(calls.map(([url]) => new URL(String(url)).pathname)).toEqual(['/verify', '/settle']);
      const tokens = calls.map(([, init]) => new Headers(init?.headers).get('authorization')!);
      expect(new Set(tokens).size).toBe(2);
      for (const token of tokens) {
        expect(token).toMatch(/^Bearer /);
        const [header, claims, signature] = token.slice('Bearer '.length).split('.');
        expect(JSON.parse(Buffer.from(header, 'base64url').toString())).toEqual({ alg: 'EdDSA', typ: 'JWT', kid: keyId });
        const payload = JSON.parse(Buffer.from(claims, 'base64url').toString());
        expect(payload).toMatchObject({ sub: keyId, iss: 'payai-merchant', jti: expect.any(String) });
        expect(payload.exp - payload.iat).toBe(120);
        expect(verify(null, Buffer.from(header + '.' + claims), publicKey, Buffer.from(signature, 'base64url'))).toBe(true);
      }
    });

    it('pauses x402 when the merchant key pair is incomplete', async () => {
      vi.stubEnv('PAYAI_API_KEY_ID', 'test-merchant-key');
      const { fetch } = mockSettlement();
      const result = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { payload: {} },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
        headers: {},
      });

      expect(result).toMatchObject({ statusCode: 503, body: { error: 'FACILITATOR_AUTH_NOT_CONFIGURED' } });
      expect(JSON.stringify(result)).not.toContain('test-merchant-key');
      expect(fetch).not.toHaveBeenCalled();
    });

    it('stops before settlement when PayAI rejects the merchant authentication', async () => {
      const { privateKey } = generateKeyPairSync('ed25519');
      vi.stubEnv('PAYAI_API_KEY_ID', 'rejected-key');
      vi.stubEnv('PAYAI_API_KEY_SECRET', privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64'));
      const { fetch } = mockSettlement({ rejectedKey: true });
      const request = await paidRequest();

      await expect(handleX402CapabilityExecution(request)).rejects.toThrow('PayAI did not authorize the request.');
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/verify'))).toHaveLength(1);
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/settle'))).toHaveLength(0);
      expect(await getAgentEconomyStore().listMachineRevenue()).toHaveLength(0);
    });

    it('records a Base transfer and returns the same receipt on concurrent retries', async () => {
      const { fetch } = mockSettlement();
      const request = await paidRequest();
      const responses = await Promise.all([
        handleX402CapabilityExecution(request),
        handleX402CapabilityExecution(request),
      ]);
      const retry = await handleX402CapabilityExecution(request);
      const result = responses.find(response => response.statusCode === 200) ?? retry;
      expect(result.statusCode).toBe(200);
      expect(retry.body).toEqual(result.body);
      expect(retry.headers['PAYMENT-RESPONSE']).toBe(result.headers['PAYMENT-RESPONSE']);
      const receipt = JSON.parse(Buffer.from(retry.headers['PAYMENT-RESPONSE'], 'base64').toString());
      expect(receipt).toMatchObject({ success: true, network: 'eip155:8453', transaction: txHash });
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/settle'))).toHaveLength(1);
      const payaiCalls = fetch.mock.calls.filter(([url]) => String(url).startsWith('https://facilitator.payai.network/'));
      expect(payaiCalls.every(([, init]) => !new Headers(init?.headers).has('authorization'))).toBe(true);

      const store = getAgentEconomyStore();
      const delivered = await store.getX402Settlement(txHash);
      expect(delivered?.state).toBe('DELIVERED');
      expect(await store.listMachineRevenue()).toMatchObject([{ status: 'SETTLED', txHash, amountUsdc: 0.01 }]);
      expect(await store.listMachineCustomers()).toMatchObject([{ jobsPurchased: 1, totalUsdcPaid: 0.01 }]);
      expect((await handleX402CapabilityExecution({ ...request, input: { payload: {} } })).statusCode).toBe(409);
    });

    it('waits for the Base receipt and reconciles an interrupted facilitator call using the original payment', async () => {
      const { confirm, fetch } = mockSettlement({ status: 'pending', lostResponse: true });
      const request = await paidRequest('gxeon_json_validate_v1', { payload: { service: 'GXEON' } });
      const pending = await handleX402CapabilityExecution(request);
      expect(pending.statusCode).toBe(503);
      expect(pending.body).toMatchObject({ error: 'SETTLEMENT_PENDING' });
      expect(await getAgentEconomyStore().listMachineRevenue()).toHaveLength(0);

      confirm();
      const paid = await handleX402CapabilityExecution(request);
      expect(paid.statusCode).toBe(200);
      expect(paid.body).toMatchObject({ result: { valid: true, errors: [] }, receipt: { txHash, amountUsdc: '0.010000' } });
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/settle'))).toHaveLength(1);
    });

    it('waits for finality even when the Base receipt already contains the matching transfer', async () => {
      const { confirm, fetch } = mockSettlement({ status: 'unfinalized' });
      const original = await paidRequest();

      const pending = await handleX402CapabilityExecution(original);
      expect(pending.statusCode).toBe(503);
      expect(pending.headers['Retry-After']).toBe('30');
      expect(await getAgentEconomyStore().listMachineRevenue()).toHaveLength(0);

      confirm();
      const result = await handleX402CapabilityExecution(original);
      expect(result.statusCode).toBe(200);
      expect(fetch.mock.calls.filter(([url]) => String(url).endsWith('/settle'))).toHaveLength(1);
      expect(await getAgentEconomyStore().listMachineRevenue()).toMatchObject([{ txHash, status: 'SETTLED' }]);
    });

    it('does not credit the authorization when the facilitator returns a hash without a Base receipt', async () => {
      mockSettlement({ status: 'pending' });
      const result = await handleX402CapabilityExecution(await paidRequest());
      expect(result.statusCode).toBe(503);
      expect(await getAgentEconomyStore().listMachineRevenue()).toHaveLength(0);
    });

    it('requires a matching USDC transfer even after facilitator success', async () => {
      mockSettlement({ status: 'unmatched' });
      const result = await handleX402CapabilityExecution(await paidRequest());
      expect(result.statusCode).toBe(402);
      expect(result.body).toMatchObject({ error: 'PAYMENT_VERIFICATION_FAILED' });
      expect(await getAgentEconomyStore().listMachineRevenue()).toHaveLength(0);
    });

    it('declines payment proofs for unsupported networks', async () => {
      const res = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { rawJson: '{"test":true}' },
        headers: {
          'payment-signature': JSON.stringify({
            network: 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp',
            txHash: '0xmock_solana_unsupported',
          }),
        },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(res.statusCode).toBe(402);
      expect((res.body as any).error).toBe('PAYMENT_VERIFICATION_FAILED');
    });
  });
});

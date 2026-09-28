import { describe, it, expect, beforeEach } from 'vitest';
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
import { resetAgentEconomyStoreForTesting, getAgentEconomyStore } from '../../src/agent-economy/store.js';
import {
  generateTreasuryChallenge,
  verifyTreasurySignature,
  FORBIDDEN_EXAMPLE_ADDRESS,
} from '../../src/agent-economy/x402/treasuryVerifier.js';

const TEST_OPERATOR_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80' as const;
const testAccount = privateKeyToAccount(TEST_OPERATOR_KEY);
const TEST_OPERATOR_ADDRESS = testAccount.address;

describe('GXEON-GLOBAL-MACHINE-REVENUE-001 Autonomous Machine-to-Machine Sales Test Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
    process.env.GXEON_X402_ALLOW_TEST_PROOFS = 'true';
    process.env.GXEON_X402_BASE_PAYTO = TEST_OPERATOR_ADDRESS;
    process.env.GXEON_TREASURY_VERIFIED = 'true';
    process.env.GXEON_AUTONOMOUS_SELLING_ENABLED = 'true';
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
      expect(challengeRes.headers['payment-required']).toBeDefined();
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


    it('executes capability, claims settlement atomically, persists revenue and returns PAYMENT-RESPONSE header', async () => {
      const store = getAgentEconomyStore();
      const testProof = {
        network: 'eip155:8453',
        txHash: '0xtest_tx_valid_atomic_claim_001',
        payerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const result = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: {
          rawJson: JSON.stringify({ name: 'GXEON', live: true }),
        },
        headers: {
          'payment-signature': JSON.stringify(testProof),
        },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(result.statusCode).toBe(200);
      expect(result.headers['PAYMENT-RESPONSE']).toBeDefined();
      expect(result.headers['X-402-Receipt']).toBeDefined();

      const body = result.body as any;
      expect(body.status).toBe('SUCCESS');
      expect(body.result.valid).toBe(true);
      expect(body.receipt).toBeDefined();
      expect(body.receipt.receiptId.startsWith('rcpt_')).toBe(true);
      expect(body.receipt.seller).toBe('GXEON');
      expect(body.receipt.paymentRail).toBe('x402');
      expect(body.receipt.currency).toBe('USDC');
      expect(body.receipt.resultHash).toBeDefined();
      expect(body.receipt.evidenceHash).toBeDefined();

      // Verify settlement was recorded atomically in store
      const settlement = await store.getX402Settlement(testProof.txHash);
      expect(settlement).toBeDefined();
      expect(settlement?.state).toBe('DELIVERED');

      // Verify real machine revenue record was created
      const revenues = await store.listMachineRevenue();
      expect(revenues.length).toBe(1);
      expect(revenues[0].status).toBe('SETTLED');
      expect(revenues[0].amountUsdc).toBe(0.01);
      expect(revenues[0].txHash).toBe(testProof.txHash);

      // Verify machine customer was recorded
      const customers = await store.listMachineCustomers();
      expect(customers.length).toBe(1);
      expect(customers[0].jobsPurchased).toBe(1);
      expect(customers[0].totalUsdcPaid).toBe(0.01);

      // REPLAY TEST: Replaying the exact same payment must be blocked
      const replayResult = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { rawJson: '{"test":true}' },
        headers: {
          'payment-signature': JSON.stringify(testProof),
        },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect([402, 409]).toContain(replayResult.statusCode);
      expect((replayResult.body as any).error).toMatch(/REPLAY_BLOCKED|PAYMENT_VERIFICATION_FAILED/);

      // Revenue must not have increased
      const revenuesAfterReplay = await store.listMachineRevenue();
      expect(revenuesAfterReplay.length).toBe(1);
    });

    it('rejects unsupported network and logs invalid payment attempt', async () => {
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

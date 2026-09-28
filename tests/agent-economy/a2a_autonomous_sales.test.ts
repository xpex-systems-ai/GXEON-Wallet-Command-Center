import { describe, it, expect, beforeEach } from 'vitest';
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
import { resetAgentEconomyStoreForTesting } from '../../src/agent-economy/store.js';

describe('GXEON-A2A-MONEY-001 Autonomous Machine-to-Machine Sales Test Suite', () => {
  beforeEach(() => {
    resetAgentEconomyStoreForTesting();
    process.env.GXEON_X402_ALLOW_TEST_PROOFS = 'true';
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

  describe('Native x402 Seller Protocol Gateway', () => {
    it('returns HTTP 402 Challenge when payment proof is missing', async () => {
      const challengeRes = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { payload: { status: 'healthy' } },
        headers: {},
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(challengeRes.statusCode).toBe(402);
      expect(challengeRes.headers['X-402-Version']).toBe('2');
      const body = challengeRes.body as any;
      expect(body.status).toBe(402);
      expect(body.title).toBe('Payment Required');
      expect(Array.isArray(body.accepts)).toBe(true);
      expect(body.accepts[0].network).toBe('eip155:8453');
      expect(body.accepts[0].amount).toBe('10000'); // 0.01 USDC
      expect(body.accepts[0].payTo).toBeDefined();
    });

    it('executes capability and returns 200 with immutable receipt on verified settlement', async () => {
      const testProof = {
        network: 'eip155:8453',
        txHash: '0xtest_tx_valid_settlement_001',
        payerAddress: '0x1234567890abcdef1234567890abcdef12345678',
      };

      const result = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: {
          payload: JSON.stringify({ name: 'GXEON', live: true }),
          schema: { type: 'object', required: ['name'] },
        },
        headers: {
          'x-payment-proof': JSON.stringify(testProof),
        },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(result.statusCode).toBe(200);
      const body = result.body as any;
      expect(body.status).toBe('SUCCESS');
      expect(body.result.valid).toBe(true);
      expect(body.receipt).toBeDefined();
      expect(body.receipt.receiptId.startsWith('rcpt_')).toBe(true);
      expect(body.receipt.seller).toBe('GXEON');
      expect(body.receipt.paymentRail).toBe('x402');
      expect(body.receipt.currency).toBe('USDC');
      expect(body.receipt.evidenceHash).toBeDefined();

      // Replay Protection: same txHash must be rejected
      const replayResult = await handleX402CapabilityExecution({
        serviceId: 'gxeon_json_validate_v1',
        input: { payload: { status: 'healthy' } },
        headers: {
          'x-payment-proof': JSON.stringify(testProof),
        },
        resourceUrl: 'https://gxeon.ai/x402/json-validate',
      });

      expect(replayResult.statusCode).toBe(402);
      expect((replayResult.body as any).error).toBe('PAYMENT_VERIFICATION_FAILED');
      expect((replayResult.body as any).message).toContain('already been consumed');
    });
  });
});

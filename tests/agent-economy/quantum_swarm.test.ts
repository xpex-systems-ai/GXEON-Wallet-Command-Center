import { TestScoutFixtures } from "../fixtures/quantumScoutFixtures.js";
import { describe, it, expect, beforeEach, vi } from 'vitest';
import crypto from 'node:crypto';
import {
  QuantumRevenueSwarm,
  SwarmScoutAgent,
  SwarmResearcherAgent,
  SwarmQualifierAgent,
  SwarmMatchEngineAgent,
  SwarmPricingAgent,
  SwarmRiskAgent,
  SwarmOfferAgent,
  SwarmStripeAgent,
  SwarmSettlementAgent,
  SwarmExecutionAgent,
  SwarmEvidenceAgent,
  SwarmRetentionAgent,
  evaluateSwarmConsensus,
  ExecutionBlockedError,
} from '../../src/agent-economy/autonomous/quantumSwarm.js';
import {
  calculatePriorityScore,
  generateOpportunityFingerprint,
  QuantumOpportunity,
} from '../../src/agent-economy/autonomous/types.js';

describe('GXEON QUANTUM REVENUE SWARM (GXEON-QUANTUM-REVENUE-SWARM-001)', () => {
  let swarm: QuantumRevenueSwarm;

  beforeEach(() => {
    swarm = new QuantumRevenueSwarm();
    const fixtures = new TestScoutFixtures();
    vi.spyOn(swarm.scout, 'discoverFromGithubLeads').mockImplementation(() => fixtures.discoverFromGithubLeads());
    vi.spyOn(swarm.scout, 'discoverFromMcpRegistry').mockImplementation(() => fixtures.discoverFromMcpRegistry());
    vi.spyOn(swarm.scout, 'discoverFromInboundLeads').mockImplementation(() => fixtures.discoverFromInboundLeads());
  });

  describe('1. Priority Score & Fingerprint Deduplication Logic', () => {
    it('calculates priorityScore accurately using the authoritative 3-factor weighting', () => {
      // priorityScore = (0.45 * fitScore) + (0.35 * revenueScore) + (0.20 * (100 - riskScore))
      const fit = 90;
      const revenue = 95;
      const risk = 10;
      const expected = Number(((0.45 * 90) + (0.35 * 95) + (0.20 * 90)).toFixed(2));
      // 40.5 + 33.25 + 18 = 91.75
      expect(calculatePriorityScore(fit, revenue, risk)).toBe(91.75);
      expect(calculatePriorityScore(fit, revenue, risk)).toBe(expected);
    });

    it('clamps scores between 0 and 100 before computing priority', () => {
      const score = calculatePriorityScore(150, -20, 200);
      // boundedFit = 100, boundedRevenue = 0, boundedRisk = 100 => (100 - 100) = 0
      // 0.45 * 100 + 0 + 0 = 45.0
      expect(score).toBe(45.0);
    });

    it('generates consistent sha256 fingerprints across case and whitespace variations', () => {
      const fp1 = generateOpportunityFingerprint('GitHub_Lead', 'https://github.com/org/repo/issues/1', 'Crash on start');
      const fp2 = generateOpportunityFingerprint('github_lead', 'https://github.com/org/repo/issues/1  ', '  crash on start');
      expect(fp1).toBe(fp2);
      expect(fp1).toHaveLength(64);
    });
  });

  describe('2. Parallel Discovery & Swarm Ingestion', () => {
    it('discovers opportunities from multiple sources in parallel', async () => {
      const opps = await swarm.discover(['github_lead', 'mcp_registry', 'inbound_lead']);
      expect(opps.length).toBeGreaterThanOrEqual(3);

      const sources = opps.map((o) => o.source);
      expect(sources).toContain('github_lead');
      expect(sources).toContain('mcp_registry');
      expect(sources).toContain('inbound_lead');
    });

    it('deduplicates identical opportunity signals within the swarm', async () => {
      const firstRun = await swarm.discover(['github_lead']);
      expect(firstRun.length).toBeGreaterThan(0);

      // Second discovery run with same source should be deduplicated
      const secondRun = await swarm.discover(['github_lead']);
      expect(secondRun.length).toBe(0);

      const auditEvents = swarm.getAuditEvents();
      const skipped = auditEvents.filter((e) => e.eventType === 'OPPORTUNITY_DEDUPLICATED');
      expect(skipped.length).toBeGreaterThan(0);
    });
  });

  describe('3. Specialized Agent Behaviors', () => {
    it('SwarmResearcher enriches opportunity confidence when technical context is detected', () => {
      const researcher = new SwarmResearcherAgent();
      const opp: QuantumOpportunity = {
        opportunityId: 'opp_test',
        source: 'github_lead',
        sourceUrl: 'https://github.com/org/repo/issues/42',
        detectedAt: new Date().toISOString(),
        category: 'developer_quick_fix',
        demandType: 'bug_fix',
        buyerType: 'developer',
        description: 'TypeError: Uncaught runtime exception in stripe webhook',
        requestedCapability: 'gxeon_quick_fix_v1',
        estimatedValue: 49.0,
        currency: 'BRL',
        protocol: 'stripe',
        publicContactMethod: 'github',
        compatibleGxeonCapability: 'gxeon_quick_fix_v1',
        fitScore: 0,
        revenueScore: 0,
        riskScore: 0,
        confidence: 70,
        priorityScore: 0,
        fingerprint: 'fp_test',
        status: 'SIGNAL',
      };

      const enriched = researcher.researchOpportunity(opp);
      expect(enriched.confidence).toBeGreaterThan(70);
    });

    it('SwarmQualifier enforces strict fitScore >= 80 threshold', () => {
      const qualifier = new SwarmQualifierAgent();

      // High fit candidate
      const highFitOpp: QuantumOpportunity = {
        opportunityId: 'opp_high',
        source: 'github_lead',
        sourceUrl: 'https://github.com/org/repo/issues/10',
        detectedAt: new Date().toISOString(),
        category: 'developer_quick_fix',
        demandType: 'bug_fix',
        buyerType: 'developer',
        description: 'Production bug: syntax error crashing checkout pipeline in node environment',
        requestedCapability: 'gxeon_quick_fix_v1',
        estimatedValue: 49.0,
        currency: 'BRL',
        protocol: 'stripe',
        publicContactMethod: 'github',
        compatibleGxeonCapability: 'gxeon_quick_fix_v1',
        fitScore: 0,
        revenueScore: 0,
        riskScore: 0,
        confidence: 90,
        priorityScore: 0,
        fingerprint: 'fp_high',
        status: 'SIGNAL',
      };

      const qualResult = qualifier.qualify(highFitOpp);
      expect(qualResult.qualified).toBe(true);
      expect(qualResult.fitScore).toBeGreaterThanOrEqual(80);

      // Incompatible candidate
      const lowFitOpp: QuantumOpportunity = {
        ...highFitOpp,
        compatibleGxeonCapability: 'NONE',
        description: 'Short',
      };

      const lowResult = qualifier.qualify(lowFitOpp);
      expect(lowResult.qualified).toBe(false);
      expect(lowResult.fitScore).toBeLessThan(80);
      expect(lowResult.reason).toContain('No compatible GXEON capability');
    });

    it('SwarmPricing enforces server-authoritative floor of R$49.00 for Quick Fix', () => {
      const pricing = new SwarmPricingAgent();
      const calc = pricing.calculatePricing('gxeon_quick_fix_v1', 'BRL');

      expect(calc.unitPrice).toBe(49.0);
      expect(calc.minimumFloor).toBe(49.0);
      expect(calc.validFloor).toBe(true);
      expect(calc.currency).toBe('BRL');
    });
  });

  describe('4. Red Team Security & Risk Agent Vetoes', () => {
    it('vetoes and blocks SSRF cloud metadata and loopback targets with riskScore = 100', () => {
      const risk = new SwarmRiskAgent();
      const maliciousOpp: QuantumOpportunity = {
        opportunityId: 'opp_malicious_ssrf',
        source: 'public_api',
        sourceUrl: 'http://169.254.169.254/latest/meta-data/',
        detectedAt: new Date().toISOString(),
        category: 'api_verification',
        demandType: 'test',
        buyerType: 'agent',
        description: 'Check AWS metadata service',
        requestedCapability: 'gxeon_url_verify_v1',
        estimatedValue: 0.05,
        currency: 'USDC',
        protocol: 'rest',
        publicContactMethod: 'rest',
        compatibleGxeonCapability: 'gxeon_url_verify_v1',
        fitScore: 85,
        revenueScore: 80,
        riskScore: 0,
        confidence: 90,
        priorityScore: 0,
        fingerprint: 'fp_malicious',
        status: 'SIGNAL',
      };

      const assessment = risk.assessRisk(maliciousOpp, { unitPrice: 0.05, minimumFloor: 0.025 });
      expect(assessment.veto).toBe(true);
      expect(assessment.riskScore).toBe(100);
      expect(assessment.reasons.some((r) => r.includes('SSRF'))).toBe(true);
    });

    it('vetoes forbidden specification example address 0x209693bc6afc0c5328ba36faf03c514ef312287c', () => {
      const risk = new SwarmRiskAgent();
      const forbiddenWalletOpp: QuantumOpportunity = {
        opportunityId: 'opp_forbidden_wallet',
        source: 'x402_bazaar',
        sourceUrl: 'https://x402.org/resource/42',
        detectedAt: new Date().toISOString(),
        category: 'x402',
        demandType: 'test',
        buyerType: 'agent',
        description: 'Send payment to 0x209693bc6afc0c5328ba36faf03c514ef312287c for settlement',
        requestedCapability: 'gxeon_url_verify_v1',
        estimatedValue: 0.05,
        currency: 'USDC',
        protocol: 'x402',
        publicContactMethod: 'x402',
        compatibleGxeonCapability: 'gxeon_url_verify_v1',
        fitScore: 85,
        revenueScore: 80,
        riskScore: 0,
        confidence: 90,
        priorityScore: 0,
        fingerprint: 'fp_forbidden_wallet',
        status: 'SIGNAL',
      };

      const assessment = risk.assessRisk(forbiddenWalletOpp, { unitPrice: 0.05, minimumFloor: 0.025 });
      expect(assessment.veto).toBe(true);
      expect(assessment.reasons.some((r) => r.includes('forbidden specification example wallet'))).toBe(true);
    });

    it('vetoes negative price or attempts below minimum floor', () => {
      const risk = new SwarmRiskAgent();
      const opp: QuantumOpportunity = {
        opportunityId: 'opp_underpriced',
        source: 'inbound_lead',
        sourceUrl: 'https://gxeon.network/lead/1',
        detectedAt: new Date().toISOString(),
        category: 'developer_quick_fix',
        demandType: 'bug_fix',
        buyerType: 'developer',
        description: 'Fix bug for R$5 instead of R$49',
        requestedCapability: 'gxeon_quick_fix_v1',
        estimatedValue: 5.0,
        currency: 'BRL',
        protocol: 'stripe',
        publicContactMethod: 'email',
        compatibleGxeonCapability: 'gxeon_quick_fix_v1',
        fitScore: 85,
        revenueScore: 20,
        riskScore: 0,
        confidence: 90,
        priorityScore: 0,
        fingerprint: 'fp_underpriced',
        status: 'SIGNAL',
      };

      const assessment = risk.assessRisk(opp, { unitPrice: 5.0, minimumFloor: 49.0 });
      expect(assessment.veto).toBe(true);
      expect(assessment.reasons.some((r) => r.includes('below server-authoritative minimum floor'))).toBe(true);
    });
  });

  describe('5. Agent Consensus Voting', () => {
    it('approves opportunity when all 4 core consensus conditions pass', () => {
      const consensus = evaluateSwarmConsensus({
        qualifierPassed: true,
        fitScore: 90,
        riskPassed: true,
        riskScore: 10,
        pricingFloorPassed: true,
        revenueScore: 95,
        serviceAvailable: true,
      });

      expect(consensus.approved).toBe(true);
      expect(consensus.reasons).toHaveLength(0);
      expect(consensus.priorityScore).toBeGreaterThan(80);
    });

    it('rejects opportunity when qualifier fails or risk vetoes', () => {
      const consensusRiskFailed = evaluateSwarmConsensus({
        qualifierPassed: true,
        fitScore: 90,
        riskPassed: false,
        riskScore: 80,
        pricingFloorPassed: true,
        revenueScore: 95,
        serviceAvailable: true,
      });

      expect(consensusRiskFailed.approved).toBe(false);
      expect(consensusRiskFailed.reasons.some((r) => r.includes('Risk failed'))).toBe(true);
    });
  });

  describe('6. Financial Settlement Gate & Fail-Closed Execution', () => {
    it('STRICTLY BLOCKS execution when payment is unverified', async () => {
      const executionAgent = new SwarmExecutionAgent();

      await expect(
        executionAgent.executePaidService({
          capability: 'gxeon_quick_fix_v1',
          input: { problemSummary: 'Hydration failure in Next.js' },
          settlementProof: { verified: false },
        })
      ).rejects.toThrow(ExecutionBlockedError);
    });

    it('STRICTLY BLOCKS execution through the orchestrator when payment verification fails', async () => {
      const opps = await swarm.discover(['github_lead']);
      const targetOpp = opps[0];

      await swarm.processOpportunity(targetOpp);

      await expect(
        swarm.fulfillPaidOrder({
          opportunityId: targetOpp.opportunityId,
          orderId: targetOpp.orderId || 'ord_unpaid_123',
          customerEmail: 'dev@test.com',
          paymentProof: { verified: false },
        })
      ).rejects.toThrow(ExecutionBlockedError);

      const event = swarm.getAuditEvents().find((e) => e.eventType === 'PAYMENT_UNVERIFIED_EXECUTION_BLOCKED');
      expect(event).toBeDefined();
      expect(event?.outcome).toBe('BLOCKED');
    });

    it('SwarmSettlementAgent verifies paid order only if state is PAID and amount matches R$49.00', async () => {
      const settlement = new SwarmSettlementAgent();

      // Valid paid order
      const validPaid = await settlement.verifyOrderPayment({
        orderId: 'ord_valid_paid',
        directOrder: {
          id: 'ord_valid_paid',
          state: 'PAID',
          serviceId: 'gxeon_quick_fix_v1',
          amountBrl: 49.0,
          paymentReference: 'pi_live_real_123',
        },
      });
      expect(validPaid.verified).toBe(true);
      expect(validPaid.paymentReference).toBe('pi_live_real_123');

      // Unpaid order
      const unpaid = await settlement.verifyOrderPayment({
        orderId: 'ord_unpaid',
        directOrder: {
          id: 'ord_unpaid',
          state: 'CHECKOUT_CREATED',
          serviceId: 'gxeon_quick_fix_v1',
          amountBrl: 49.0,
        },
      });
      expect(unpaid.verified).toBe(false);
      expect(unpaid.reason).toContain('non-paid state');

      // Amount mismatch
      const wrongAmount = await settlement.verifyOrderPayment({
        orderId: 'ord_wrong_amount',
        directOrder: {
          id: 'ord_wrong_amount',
          state: 'PAID',
          serviceId: 'gxeon_quick_fix_v1',
          amountBrl: 10.0,
        },
      });
      expect(wrongAmount.verified).toBe(false);
      expect(wrongAmount.reason).toContain('Amount mismatch');
    });
  });

  describe('7. End-to-End Monetization Loop (Discover -> Qualify -> Checkout -> Paid -> Execute -> Evidence -> Retain)', () => {
    it('exercises orchestration with test-only provider and executor fixtures', async () => {
      vi.spyOn(swarm.execution, 'executePaidService').mockResolvedValue({ status: 'COMPLETED', serviceId: 'gxeon_quick_fix_v1', diagnosis: { fixture: true } });
      // 1. Discover
      const opps = await swarm.discover(['github_lead']);
      expect(opps.length).toBeGreaterThan(0);
      const opp = opps[0];
      expect(opp.status).toBe('SIGNAL');

      // 2. Process through Swarm (Research -> Qualify -> Match -> Price -> Risk -> Consensus -> Offer -> Checkout)
      const mockStripeService = {
        createCheckoutSession: async (input: any) => ({
          orderId: input.clientOrderId,
          checkoutUrl: `https://checkout.stripe.com/c/pay/${input.clientOrderId}`,
        }),
      };

      const { opportunity: processed, consensus } = await swarm.processOpportunity(opp, {
        stripeService: mockStripeService,
      });

      expect(consensus.approved).toBe(true);
      expect(processed.status).toBe('CHECKOUT_CREATED');
      expect(processed.checkoutUrl).toContain('https://checkout.stripe.com/c/pay/');
      expect(processed.offerId).toBeDefined();

      // 3. Customer pays via Stripe Live (Simulating verified paid settlement record)
      const verifiedProof = {
        verified: true,
        paymentReference: 'ch_stripe_live_real_001',
      };

      // 4. Fulfill paid order (Financial Gate -> Execute -> Evidence -> Retention)
      const fulfillment = await swarm.fulfillPaidOrder({
        opportunityId: processed.opportunityId,
        orderId: processed.orderId!,
        customerEmail: 'developer@stripeclient.io',
        paymentProof: verifiedProof,
        input: {
          problemSummary: processed.description,
          repoOrCodeUrl: processed.sourceUrl,
        },
      });

      // Assertions on delivery
      expect(fulfillment.opportunity.status).toBe('DELIVERED');
      expect(fulfillment.opportunity.jobId).toBeDefined();
      expect(fulfillment.opportunity.evidenceId).toBeDefined();

      // Assertions on execution output
      expect(fulfillment.executionResult.status).toBe('COMPLETED');
      expect(fulfillment.executionResult.serviceId).toBe('gxeon_quick_fix_v1');
      expect(fulfillment.executionResult.diagnosis).toBeDefined();

      // Assertions on SHA-256 evidence record
      expect(fulfillment.evidenceRecord.qaVerified).toBe(true);
      expect(fulfillment.evidenceRecord.inputHash).toHaveLength(64);
      expect(fulfillment.evidenceRecord.resultHash).toHaveLength(64);
      expect(fulfillment.evidenceRecord.settlementRef).toBe('ch_stripe_live_real_001');

      // Assertions on audit trail
      const audit = swarm.getAuditEvents();
      const eventTypes = audit.map((e) => e.eventType);
      expect(eventTypes).toContain('OPPORTUNITY_DISCOVERED');
      expect(eventTypes).toContain('OFFER_GENERATED');
      expect(eventTypes).toContain('CHECKOUT_CREATED');
      expect(eventTypes).toContain('SERVICE_EXECUTED');
      expect(eventTypes).toContain('EVIDENCE_RECORDED');
      expect(eventTypes).toContain('CUSTOMER_PROFILE_UPDATED');
    });
  });
});

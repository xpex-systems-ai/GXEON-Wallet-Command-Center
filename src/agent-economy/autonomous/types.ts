import crypto from 'node:crypto';

/**
 * GXEON Autonomous Agent-to-Agent (A2A) Domain Contracts
 * MISSION: GXEON-A2A-MONEY-001
 */

export type AutonomousOpportunityState =
  | 'DISCOVERED'
  | 'QUALIFIED'
  | 'OFFER_READY'
  | 'OFFER_SENT'
  | 'QUOTE_REQUESTED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'EXECUTING'
  | 'DELIVERED'
  | 'REPEAT_READY'
  | 'REJECTED';

export interface AutonomousCandidate {
  opportunityId: string;
  source: 'x402_bazaar' | 'mcp_registry' | 'public_api' | 'github_lead';
  resourceUrl: string;
  serviceName: string;
  description: string;
  observedPrice?: number | null;
  observedCurrency?: string;
  calls30d?: number | null;
  uniquePayers30d?: number | null;
  compatibleCapability: 'gxeon_url_verify_v1' | 'gxeon_json_validate_v1' | 'NONE';
  fitScore: number; // 0 - 100
  machineContactMethod: 'x402' | 'mcp' | 'rest_api' | 'none';
  status: AutonomousOpportunityState;
  discoveredAt: string;
}

export interface QualificationResult {
  fitScore: number; // 0 - 100
  qualified: boolean; // true if fitScore >= 80
  criteria: {
    capabilityMatch: boolean;
    machineCallable: boolean;
    publicEndpoint: boolean;
    acceptedProtocol: boolean;
    pricingCompatible: boolean;
    recentUsageSignal: boolean;
  };
  rejectionReason?: string;
}

export interface AutonomousOfferRequest {
  buyerAgentId: string;
  requestedCapability: 'gxeon_url_verify_v1' | 'gxeon_json_validate_v1' | 'url_verification' | 'json_validation';
  quantity: number;
  maxUnitPrice?: number;
  currency?: 'credits' | 'USDC';
}

export interface AutonomousOffer {
  offerId: string;
  seller: 'GXEON';
  serviceId: 'gxeon_url_verify_v1' | 'gxeon_json_validate_v1';
  quantity: number;
  unitPrice: number;
  total: number;
  currency: 'credits' | 'USDC';
  expiresAt: string;
  paymentMethods: Array<'prepaid_credits' | 'x402'>;
  ttlSeconds: number;
}

export interface NegotiationRequest {
  offerId: string;
  requestedQuantity: number;
  requestedUnitPrice: number;
}

export interface NegotiationResult {
  accepted: boolean;
  reason?: string;
  counterOffer?: AutonomousOffer;
}

export interface MachineCustomerProfile {
  machineCustomerId: string;
  firstSeen: string;
  lastSeen: string;
  jobsPurchased: number;
  lifetimeRevenueCredits: number;
  lifetimeRevenueUsdc: number;
  preferredCapability: string;
  retentionTier: 'NEW' | 'ACTIVE' | 'HIGH_VOLUME' | 'ENTERPRISE';
}

/**
 * GXEON QUANTUM REVENUE SWARM CONTRACTS
 * MISSION: GXEON-QUANTUM-REVENUE-SWARM-001
 */

export type QuantumOpportunityStatus =
  | 'SIGNAL'
  | 'QUALIFIED'
  | 'OFFER_READY'
  | 'OFFER_SENT'
  | 'CHECKOUT_CREATED'
  | 'PAYMENT_PENDING'
  | 'PAID'
  | 'EXECUTING'
  | 'DELIVERED'
  | 'LOST';

export type QuantumDiscoverySource =
  | 'radar'
  | 'x402_bazaar'
  | 'mcp_registry'
  | 'public_api'
  | 'github_lead'
  | 'inbound_lead';

export interface QuantumOpportunity {
  opportunityId: string;
  source: QuantumDiscoverySource;
  sourceUrl: string;
  detectedAt: string;
  category: string;
  demandType: string;
  buyerType: 'agent' | 'developer' | 'enterprise' | 'individual';
  description: string;
  requestedCapability: string;
  estimatedValue: number;
  currency: 'BRL' | 'USDC' | 'credits';
  protocol: 'stripe' | 'x402' | 'mcp' | 'rest';
  publicContactMethod: string;
  compatibleGxeonCapability: 'gxeon_quick_fix_v1' | 'gxeon_json_validate_v1' | 'gxeon_url_verify_v1' | 'NONE';
  fitScore: number; // 0 - 100
  revenueScore: number; // 0 - 100
  riskScore: number; // 0 - 100
  confidence: number; // 0 - 100
  priorityScore: number; // (0.45 * fitScore) + (0.35 * revenueScore) + (0.20 * (100 - riskScore))
  fingerprint: string; // sha256(source + sourceUrl + normalizedDemand)
  status: QuantumOpportunityStatus;
  offerId?: string;
  checkoutUrl?: string;
  orderId?: string;
  jobId?: string;
  executionResult?: Record<string, unknown>;
  evidenceId?: string;
  rejectionReason?: string;
}

export type SwarmRole =
  | 'GXEON_SCOUT'
  | 'GXEON_RESEARCHER'
  | 'GXEON_QUALIFIER'
  | 'GXEON_MATCH_ENGINE'
  | 'GXEON_PRICING_AGENT'
  | 'GXEON_OFFER_AGENT'
  | 'GXEON_STRIPE_AGENT'
  | 'GXEON_SETTLEMENT_AGENT'
  | 'GXEON_EXECUTION_AGENT'
  | 'GXEON_EVIDENCE_AGENT'
  | 'GXEON_RETENTION_AGENT'
  | 'GXEON_RISK_AGENT';

export interface SwarmEvent {
  eventId: string;
  agentId: SwarmRole;
  eventType: string;
  requestId?: string;
  correlationId?: string;
  opportunityId?: string;
  orderId?: string;
  jobId?: string;
  timestamp: string;
  outcome: 'SUCCESS' | 'FAILURE' | 'SKIPPED' | 'BLOCKED';
  details?: Record<string, unknown>;
}

export interface SwarmConsensus {
  approved: boolean;
  qualifierPassed: boolean;
  riskPassed: boolean;
  pricingFloorPassed: boolean;
  serviceAvailable: boolean;
  priorityScore: number;
  reasons: string[];
}

/**
 * Priority score calculation per Section 15:
 * priorityScore = (0.45 * fitScore) + (0.35 * revenueScore) + (0.20 * (100 - riskScore))
 */
export function calculatePriorityScore(fitScore: number, revenueScore: number, riskScore: number): number {
  const boundedFit = Math.max(0, Math.min(100, fitScore));
  const boundedRevenue = Math.max(0, Math.min(100, revenueScore));
  const boundedRisk = Math.max(0, Math.min(100, riskScore));
  const score = (0.45 * boundedFit) + (0.35 * boundedRevenue) + (0.20 * (100 - boundedRisk));
  return Number(score.toFixed(2));
}

/**
 * Deduplication fingerprint: sha256(source + sourceUrl + normalizedDemand)
 */
export function generateOpportunityFingerprint(source: string, sourceUrl: string, normalizedDemand: string): string {
  const norm = `${source.trim().toLowerCase()}:${sourceUrl.trim().toLowerCase()}:${normalizedDemand.trim().toLowerCase()}`;
  return crypto.createHash('sha256').update(norm).digest('hex');
}



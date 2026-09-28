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

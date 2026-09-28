import { NegotiationRequest, NegotiationResult, AutonomousOffer } from './types.js';
import { GxeonPricingAgent } from './pricingAgent.js';

const MAX_BATCH_LIMITS: Record<string, number> = {
  gxeon_url_verify_v1: 500,
  gxeon_json_validate_v1: 50,
};

export class GxeonNegotiationEngine {
  private pricingAgent = new GxeonPricingAgent();

  negotiateOffer(originalOffer: AutonomousOffer, proposal: NegotiationRequest): NegotiationResult {
    const maxBatch = MAX_BATCH_LIMITS[originalOffer.serviceId] || 500;

    // Guardrail 1: Max Batch
    if (proposal.requestedQuantity > maxBatch) {
      return {
        accepted: false,
        reason: `Requested quantity (${proposal.requestedQuantity}) exceeds maximum batch limit of ${maxBatch}`,
        counterOffer: {
          ...originalOffer,
          quantity: maxBatch,
          total: originalOffer.unitPrice * maxBatch,
        },
      };
    }

    // Guardrail 2: Strict Floor Protection
    const minimumFloor =
      originalOffer.currency === 'USDC'
        ? originalOffer.serviceId === 'gxeon_url_verify_v1'
          ? 0.025
          : 0.01
        : originalOffer.serviceId === 'gxeon_url_verify_v1'
          ? 5
          : 2;

    if (proposal.requestedUnitPrice < minimumFloor) {
      // Reject proposal and return firm counter-offer anchored at floor
      const counterPrice = this.pricingAgent.calculatePrice({
        serviceId: originalOffer.serviceId,
        quantity: proposal.requestedQuantity,
        currency: originalOffer.currency,
      });

      return {
        accepted: false,
        reason: `Requested unit price (${proposal.requestedUnitPrice}) is below immutable capability floor (${minimumFloor})`,
        counterOffer: {
          ...originalOffer,
          quantity: proposal.requestedQuantity,
          unitPrice: counterPrice.unitPrice,
          total: counterPrice.total,
        },
      };
    }

    // Accept valid counter-proposal within safe bounds
    return {
      accepted: true,
      counterOffer: {
        ...originalOffer,
        quantity: proposal.requestedQuantity,
        unitPrice: proposal.requestedUnitPrice,
        total: Number((proposal.requestedUnitPrice * proposal.requestedQuantity).toFixed(4)),
      },
    };
  }
}

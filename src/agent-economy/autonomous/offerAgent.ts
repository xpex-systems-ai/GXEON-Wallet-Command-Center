import crypto from 'node:crypto';
import { AutonomousOfferRequest, AutonomousOffer } from './types.js';
import { GxeonPricingAgent } from './pricingAgent.js';

export class GxeonOfferAgent {
  private pricingAgent = new GxeonPricingAgent();

  /**
   * Generates a binding machine-readable capability offer.
   * Never permits the buyer to dictate final price; server calculates with floor protection.
   */
  createOffer(request: AutonomousOfferRequest): AutonomousOffer {
    let serviceId: 'gxeon_url_verify_v1' | 'gxeon_json_validate_v1';
    if (
      request.requestedCapability === 'gxeon_url_verify_v1' ||
      request.requestedCapability === 'url_verification'
    ) {
      serviceId = 'gxeon_url_verify_v1';
    } else if (
      request.requestedCapability === 'gxeon_json_validate_v1' ||
      request.requestedCapability === 'json_validation'
    ) {
      serviceId = 'gxeon_json_validate_v1';
    } else {
      throw new Error(`Unsupported capability: ${request.requestedCapability}`);
    }

    const quantity = Math.max(1, Math.floor(request.quantity || 1));
    const currency = request.currency || 'credits';

    const priceCalc = this.pricingAgent.calculatePrice({
      serviceId,
      quantity,
      currency,
    });

    const offerId = `off_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + priceCalc.ttlSeconds * 1000).toISOString();

    return {
      offerId,
      seller: 'GXEON',
      serviceId,
      quantity,
      unitPrice: priceCalc.unitPrice,
      total: priceCalc.total,
      currency: priceCalc.currency,
      expiresAt,
      paymentMethods: ['prepaid_credits', 'x402'],
      ttlSeconds: priceCalc.ttlSeconds,
    };
  }
}

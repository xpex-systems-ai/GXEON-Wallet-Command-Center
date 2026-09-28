export interface PricingConfig {
  minimumMarginPercent: number; // e.g. 20 (20%)
  maximumDiscountPercent: number; // e.g. 30 (30% max volume discount)
  quoteTtlSeconds: number; // 300s
}

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  minimumMarginPercent: 20,
  maximumDiscountPercent: 30,
  quoteTtlSeconds: 300,
};

export class GxeonPricingAgent {
  private config: PricingConfig;

  constructor(config: Partial<PricingConfig> = {}) {
    this.config = { ...DEFAULT_PRICING_CONFIG, ...config };
  }

  /**
   * Calculates dynamic unit price with strict floor protection:
   * unitPrice = MAX(minimumFloor, calculatedCost + margin, marketReferenceAdjusted)
   * NUNCA: preço negativo, trabalho grátis, desconto descontrolado.
   */
  calculatePrice(params: {
    serviceId: 'gxeon_url_verify_v1' | 'gxeon_json_validate_v1';
    quantity: number;
    currency?: 'credits' | 'USDC';
    buyerVolumeLifetime?: number;
    marketObservedPrice?: number;
  }): {
    unitPrice: number;
    total: number;
    currency: 'credits' | 'USDC';
    ttlSeconds: number;
    appliedDiscountPercent: number;
  } {
    const { serviceId, quantity, currency = 'credits', buyerVolumeLifetime = 0, marketObservedPrice } = params;
    const cleanQty = Math.max(1, Math.floor(quantity));

    // 1. Establish Floors
    let minimumFloor: number;
    let baseCost: number;

    if (currency === 'USDC') {
      minimumFloor = serviceId === 'gxeon_url_verify_v1' ? 0.025 : 0.01;
      baseCost = serviceId === 'gxeon_url_verify_v1' ? 0.015 : 0.005;
    } else {
      minimumFloor = serviceId === 'gxeon_url_verify_v1' ? 5 : 2;
      baseCost = serviceId === 'gxeon_url_verify_v1' ? 3 : 1;
    }

    // 2. Cost + Margin
    const marginMultiplier = 1 + this.config.minimumMarginPercent / 100;
    const costPlusMargin = baseCost * marginMultiplier;

    // 3. Volume discount calculation (capped strictly at maximumDiscountPercent)
    let discountPercent = 0;
    if (buyerVolumeLifetime > 10000 || cleanQty >= 1000) {
      discountPercent = this.config.maximumDiscountPercent;
    } else if (buyerVolumeLifetime > 1000 || cleanQty >= 100) {
      discountPercent = 15;
    }

    // 4. Baseline unit price
    let unitPrice = minimumFloor;

    // If market price is known and higher, adjust reference
    if (marketObservedPrice && marketObservedPrice > minimumFloor) {
      unitPrice = Math.min(marketObservedPrice * 0.95, minimumFloor * 1.5);
    }

    // Apply volume discount to unit price
    unitPrice = unitPrice * (1 - discountPercent / 100);

    // Strict Floor Enforcement: MUST NEVER be below minimumFloor
    unitPrice = Math.max(minimumFloor, costPlusMargin, unitPrice);

    // Format precision
    if (currency === 'USDC') {
      unitPrice = Number(unitPrice.toFixed(4));
    } else {
      unitPrice = Math.max(minimumFloor, Math.round(unitPrice));
    }

    const total = currency === 'USDC' ? Number((unitPrice * cleanQty).toFixed(4)) : unitPrice * cleanQty;

    return {
      unitPrice,
      total,
      currency,
      ttlSeconds: this.config.quoteTtlSeconds,
      appliedDiscountPercent: discountPercent,
    };
  }
}

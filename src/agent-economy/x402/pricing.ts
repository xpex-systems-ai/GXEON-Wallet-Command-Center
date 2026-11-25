import { CSV_IMPORT_CHECK, JSON_CONTRACT_BATCH } from './premiumServices.js';

/**
 * GXEON Native x402 Pricing
 * Establishes fixed atomic micro-USDC pricing per capability item.
 */

export interface X402CapabilityPricing {
  serviceId: string;
  unitPriceAtomic: number; // 6 decimals (10000 = $0.01 USDC)
  unitPriceUsdc: number; // Decimal (0.01)
  unit: string;
}

export const X402_PRICING: Record<string, X402CapabilityPricing> = {
  gxeon_json_validate_v1: {
    serviceId: 'gxeon_json_validate_v1',
    unitPriceAtomic: 10000, // 0.01 USDC
    unitPriceUsdc: 0.01,
    unit: 'payload',
  },
  gxeon_csv_audit_v1: {
    serviceId: 'gxeon_csv_audit_v1',
    unitPriceAtomic: 10000,
    unitPriceUsdc: 0.01,
    unit: 'file',
  },
  [CSV_IMPORT_CHECK]: {
    serviceId: CSV_IMPORT_CHECK,
    unitPriceAtomic: 1_000_000,
    unitPriceUsdc: 1,
    unit: 'batch',
  },
  [JSON_CONTRACT_BATCH]: {
    serviceId: JSON_CONTRACT_BATCH,
    unitPriceAtomic: 100_000,
    unitPriceUsdc: 0.10,
    unit: 'batch',
  },
  gxeon_url_verify_v1: {
    serviceId: 'gxeon_url_verify_v1',
    unitPriceAtomic: 25000,
    unitPriceUsdc: 0.025,
    unit: 'url',
  },
};

export const X402_SERVICE_PATHS: Readonly<Record<string, string>> = {
  gxeon_json_validate_v1: '/x402/json-validate',
  gxeon_csv_audit_v1: '/x402/csv-audit',
  [CSV_IMPORT_CHECK]: '/x402/csv-import-check',
  [JSON_CONTRACT_BATCH]: '/x402/json-contract-batch',
};

export function getX402Price(
  serviceId: string,
  quantity = 1
): { amountAtomic: string; amountUsdc: number; pricing: X402CapabilityPricing } {
  const pricing = X402_PRICING[serviceId];
  if (!pricing) {
    throw new Error(`Capability ${serviceId} is not available via x402 rail`);
  }

  const cleanQty = Math.max(1, Math.floor(quantity));
  const totalAtomic = cleanQty * pricing.unitPriceAtomic;
  const totalUsdc = totalAtomic / 1_000_000;

  return {
    amountAtomic: String(totalAtomic),
    amountUsdc: totalUsdc,
    pricing,
  };
}

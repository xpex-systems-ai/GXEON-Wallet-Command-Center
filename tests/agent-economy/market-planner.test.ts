import { describe, expect, it } from 'vitest';
import { planAgentPurchase } from '../../src/agent-economy/marketPlanner.js';

describe('GXEON agent demand planner', () => {
  it('maps one JSON validation to the R$0.99 PICO pack', () => {
    expect(planAgentPurchase('gxeon_json_validate_v1', 1)).toMatchObject({
      ok: true,
      requiredCredits: 2,
      totalCredits: 2,
      totalPriceCents: 99,
      purchases: [
        {
          packId: 'pack_2',
          quantity: 1,
        },
      ],
    });
  });

  it('maps one URL verification to BYTE at R$1.99', () => {
    expect(planAgentPurchase('gxeon_url_verify_v1', 1)).toMatchObject({
      ok: true,
      requiredCredits: 5,
      totalCredits: 5,
      totalPriceCents: 199,
      purchases: [
        {
          packId: 'pack_5',
          quantity: 1,
        },
      ],
    });
  });

  it('uses the lowest-cost combination for a 2500-credit demand', () => {
    const plan = planAgentPurchase('gxeon_url_verify_v1', 500);
    expect(plan).toMatchObject({
      ok: true,
      requiredCredits: 2500,
      totalCredits: 2500,
      totalPriceCents: 33000,
    });
  });

  it('fails closed for unavailable services and invalid units', () => {
    expect(planAgentPurchase('missing_service', 1)).toMatchObject({
      ok: false,
      code: 'SERVICE_NOT_AVAILABLE',
    });
    expect(planAgentPurchase('gxeon_json_validate_v1', 0)).toMatchObject({
      ok: false,
      code: 'INVALID_UNITS',
    });
  });
});

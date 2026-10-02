import { TOPUP_PACKS, type TopupPack } from './billingCatalog.js';
import { getService } from './services/registry.js';

export type AgentPurchasePlan =
  | {
      ok: true;
      serviceId: string;
      serviceName: string;
      units: number;
      unit: string;
      unitPriceCredits: number;
      requiredCredits: number;
      totalCredits: number;
      leftoverCredits: number;
      totalPriceCents: number;
      totalPriceBrl: number;
      purchases: Array<{
        packId: string;
        name: string;
        quantity: number;
        creditsEach: number;
        priceCentsEach: number;
      }>;
      checkoutEndpoint: string;
      moneyTruth: string;
    }
  | {
      ok: false;
      code: 'SERVICE_NOT_AVAILABLE' | 'INVALID_UNITS' | 'MAX_BATCH_EXCEEDED' | 'NO_PACK_PLAN';
      message: string;
    };

type State = {
  priceCents: number;
  counts: Record<string, number>;
};

function packs(): TopupPack[] {
  return Object.values(TOPUP_PACKS).sort((a, b) => {
    if (a.credits !== b.credits) return a.credits - b.credits;
    return a.priceCents - b.priceCents;
  });
}

export function planAgentPurchase(serviceId: string, units: number): AgentPurchasePlan {
  const service = getService(serviceId);
  if (!service || service.status !== 'AVAILABLE') {
    return {
      ok: false,
      code: 'SERVICE_NOT_AVAILABLE',
      message: 'Requested GXEON service is not currently available.',
    };
  }

  if (!Number.isInteger(units) || units < 1) {
    return {
      ok: false,
      code: 'INVALID_UNITS',
      message: 'Units must be a positive integer.',
    };
  }

  if (units > service.maxBatch) {
    return {
      ok: false,
      code: 'MAX_BATCH_EXCEEDED',
      message: `This service accepts at most ${service.maxBatch} ${service.unit}(s) per job.`,
    };
  }

  const requiredCredits = Math.max(
    service.minimumChargeCredits,
    service.unitPriceCredits * units
  );

  const catalog = packs();
  const maxPackCredits = Math.max(...catalog.map(pack => pack.credits));
  const ceiling = requiredCredits + maxPackCredits;
  const dp: Array<State | undefined> = Array(ceiling + 1).fill(undefined);
  dp[0] = { priceCents: 0, counts: {} };

  for (let credits = 0; credits <= ceiling; credits += 1) {
    const current = dp[credits];
    if (!current) continue;

    for (const pack of catalog) {
      const nextCredits = credits + pack.credits;
      if (nextCredits > ceiling) continue;

      const candidatePrice = current.priceCents + pack.priceCents;
      const existing = dp[nextCredits];
      if (!existing || candidatePrice < existing.priceCents) {
        dp[nextCredits] = {
          priceCents: candidatePrice,
          counts: {
            ...current.counts,
            [pack.id]: (current.counts[pack.id] ?? 0) + 1,
          },
        };
      }
    }
  }

  let bestCredits: number | null = null;
  let bestState: State | null = null;
  for (let credits = requiredCredits; credits <= ceiling; credits += 1) {
    const state = dp[credits];
    if (!state) continue;
    if (
      !bestState ||
      state.priceCents < bestState.priceCents ||
      (state.priceCents === bestState.priceCents && credits < (bestCredits ?? Infinity))
    ) {
      bestCredits = credits;
      bestState = state;
    }
  }

  if (!bestState || bestCredits === null) {
    return {
      ok: false,
      code: 'NO_PACK_PLAN',
      message: 'No prepaid pack combination can satisfy this demand.',
    };
  }

  const byId = new Map(catalog.map(pack => [pack.id, pack]));
  const purchases = Object.entries(bestState.counts)
    .filter(([, quantity]) => quantity > 0)
    .map(([packId, quantity]) => {
      const pack = byId.get(packId)!;
      return {
        packId,
        name: pack.name,
        quantity,
        creditsEach: pack.credits,
        priceCentsEach: pack.priceCents,
      };
    })
    .sort((a, b) => b.creditsEach - a.creditsEach);

  return {
    ok: true,
    serviceId: service.serviceId,
    serviceName: service.name,
    units,
    unit: service.unit,
    unitPriceCredits: service.unitPriceCredits,
    requiredCredits,
    totalCredits: bestCredits,
    leftoverCredits: bestCredits - requiredCredits,
    totalPriceCents: bestState.priceCents,
    totalPriceBrl: bestState.priceCents / 100,
    purchases,
    checkoutEndpoint: '/v1/billing/topup',
    moneyTruth:
      'This is a read-only purchase plan. It does not create a checkout, charge a payment method, or grant credits. Credits become spendable only after provider-verified settlement.',
  };
}

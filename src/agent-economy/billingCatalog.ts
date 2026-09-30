// Shared by the storefront, checkout and signed payment handler.
export interface TopupPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  currency: 'brl';
}

export const TOPUP_PACKS: Record<string, TopupPack> = {
  pack_100: { id: 'pack_100', name: 'STARTER', credits: 100, priceCents: 2000, currency: 'brl' },
  pack_500: { id: 'pack_500', name: 'PRO', credits: 500, priceCents: 8000, currency: 'brl' },
  pack_2000: { id: 'pack_2000', name: 'ENTERPRISE', credits: 2000, priceCents: 25000, currency: 'brl' },
};

export function getTopupPack(id: unknown): TopupPack | undefined {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOPUP_PACKS, id) ? TOPUP_PACKS[id] : undefined;
}

export const BUYER_SCOPES = [
  'services:read', 'quotes:create', 'jobs:create', 'jobs:read', 'results:read', 'balance:read',
] as const;

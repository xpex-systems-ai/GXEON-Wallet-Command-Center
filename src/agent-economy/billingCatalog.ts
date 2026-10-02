// Shared by the storefront, checkout and signed payment handler.
export interface TopupPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number;
  currency: 'brl';
  audience?: 'micro' | 'starter' | 'builder' | 'scale';
}

export const TOPUP_PACKS: Record<string, TopupPack> = {
  pack_2: {
    id: 'pack_2',
    name: 'PICO',
    credits: 2,
    priceCents: 99,
    currency: 'brl',
    audience: 'micro',
  },
  pack_5: {
    id: 'pack_5',
    name: 'BYTE',
    credits: 5,
    priceCents: 199,
    currency: 'brl',
    audience: 'micro',
  },
  pack_10: {
    id: 'pack_10',
    name: 'MINI',
    credits: 10,
    priceCents: 290,
    currency: 'brl',
    audience: 'micro',
  },
  pack_20: {
    id: 'pack_20',
    name: 'NANO',
    credits: 20,
    priceCents: 490,
    currency: 'brl',
    audience: 'micro',
  },
  pack_50: {
    id: 'pack_50',
    name: 'MICRO',
    credits: 50,
    priceCents: 1190,
    currency: 'brl',
    audience: 'micro',
  },
  pack_100: {
    id: 'pack_100',
    name: 'STARTER',
    credits: 100,
    priceCents: 2000,
    currency: 'brl',
    audience: 'starter',
  },
  pack_250: {
    id: 'pack_250',
    name: 'BUILDER',
    credits: 250,
    priceCents: 4500,
    currency: 'brl',
    audience: 'builder',
  },
  pack_500: {
    id: 'pack_500',
    name: 'PRO',
    credits: 500,
    priceCents: 8000,
    currency: 'brl',
    audience: 'builder',
  },
  pack_2000: {
    id: 'pack_2000',
    name: 'ENTERPRISE',
    credits: 2000,
    priceCents: 25000,
    currency: 'brl',
    audience: 'scale',
  },
};

export function getTopupPack(id: unknown): TopupPack | undefined {
  return typeof id === 'string' && Object.prototype.hasOwnProperty.call(TOPUP_PACKS, id)
    ? TOPUP_PACKS[id]
    : undefined;
}

export const BUYER_SCOPES = [
  'services:read', 'quotes:create', 'jobs:create', 'jobs:read', 'results:read', 'balance:read',
] as const;

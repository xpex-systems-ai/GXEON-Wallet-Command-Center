import Stripe from 'stripe';
import { authenticateMachineRequest } from '../../../src/agent-economy/auth.js';
import { getAgentEconomyStore } from '../../../src/agent-economy/store.js';
import { getFeatureFlags } from '../../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from '../_helper.js';

export interface TopupPack {
  id: string;
  name: string;
  credits: number;
  priceCents: number; // In BRL centavos
  currency: 'brl';
}

export const TOPUP_PACKS: Record<string, TopupPack> = {
  pack_100: {
    id: 'pack_100',
    name: 'GXEON Machine Credits — 100 Pack',
    credits: 100,
    priceCents: 2000, // R$ 20,00
    currency: 'brl',
  },
  pack_500: {
    id: 'pack_500',
    name: 'GXEON Machine Credits — 500 Pack',
    credits: 500,
    priceCents: 8000, // R$ 80,00
    currency: 'brl',
  },
  pack_2000: {
    id: 'pack_2000',
    name: 'GXEON Machine Credits — 2000 Enterprise Pack',
    credits: 2000,
    priceCents: 25000, // R$ 250,00
    currency: 'brl',
  },
};

export default async function handler(req: any, res: any) {
  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  // GET /v1/billing/topup -> List available credit packs
  if (req.method === 'GET') {
    sendJson(res, 200, {
      rail: 'PREPAID_STRIPE',
      currency: 'BRL',
      packs: Object.values(TOPUP_PACKS),
    });
    return;
  }

  // POST /v1/billing/topup -> Generate Stripe Checkout Session for agent funding
  if (req.method === 'POST') {
    const authHeader = req.headers.authorization || req.headers.Authorization;
    let authenticatedAccountId: string | undefined;

    if (authHeader) {
      const auth = await authenticateMachineRequest(authHeader);
      if (auth.authenticated && auth.context) {
        authenticatedAccountId = auth.context.account.accountId;
      }
    }

    const body = await parseBody(req);
    if (!body) {
      sendError(res, 400, 'INVALID_INPUT', 'Malformed JSON body');
      return;
    }

    const packId = body.packId || 'pack_100';
    const pack = TOPUP_PACKS[packId];
    if (!pack) {
      sendError(res, 400, 'INVALID_INPUT', `Unknown packId: ${packId}. Available: ${Object.keys(TOPUP_PACKS).join(', ')}`);
      return;
    }

    const targetAccountId = authenticatedAccountId || body.accountId;
    if (!targetAccountId || typeof targetAccountId !== 'string') {
      sendError(res, 400, 'INVALID_INPUT', 'Missing target accountId');
      return;
    }

    const store = getAgentEconomyStore();
    const account = await store.getAccount(targetAccountId);
    if (!account) {
      sendError(res, 404, 'ACCOUNT_NOT_FOUND', `Account ${targetAccountId} not found`);
      return;
    }

    const stripeApiKey = process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY;
    if (!stripeApiKey) {
      sendError(res, 503, 'PAYMENT_RAIL_UNAVAILABLE', 'Stripe secret key is not configured');
      return;
    }

    const publicUrl = (
      process.env.GXEON_PUBLIC_URL ||
      (process.env.VERCEL_PROJECT_PRODUCTION_URL
        ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
        : process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : 'https://gxeon-wallet-command-center.vercel.app')
    ).replace(/\/$/, '');

    try {
      const stripe = new Stripe(stripeApiKey, {
        apiVersion: '2025-02-24.acacia' as any,
      });

      const session = await stripe.checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'brl',
              unit_amount: pack.priceCents,
              product_data: {
                name: pack.name,
                description: `Prepaid credit topup (${pack.credits} credits) for GXEON agent ${account.name} (${targetAccountId})`,
              },
            },
            quantity: 1,
          },
        ],
        metadata: {
          service_id: 'agent_credit_topup',
          account_id: targetAccountId,
          credits: String(pack.credits),
          pack_id: pack.id,
        },
        success_url: `${publicUrl}/agent/billing?session_id={CHECKOUT_SESSION_ID}&status=success`,
        cancel_url: `${publicUrl}/agent/billing?status=cancelled`,
      });

      sendJson(res, 201, {
        checkoutUrl: session.url,
        sessionId: session.id,
        pack,
        targetAccountId,
      });
      return;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 500, 'STRIPE_ERROR', `Failed to create Stripe Checkout session: ${msg}`);
      return;
    }
  }

  sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
}

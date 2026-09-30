import crypto from 'node:crypto';
import Stripe from 'stripe';
import { authenticateMachineRequest, generateApiKey } from '../../../src/agent-economy/auth.js';
import { getAgentEconomyStore } from '../../../src/agent-economy/store.js';
import { getFeatureFlags } from '../../../src/agent-economy/featureFlags.js';
import { BUYER_SCOPES, TOPUP_PACKS, getTopupPack } from '../../../src/agent-economy/billingCatalog.js';
import { sendJson, sendError, parseBody } from '../_helper.js';

export { TOPUP_PACKS } from '../../../src/agent-economy/billingCatalog.js';
export type { TopupPack } from '../../../src/agent-economy/billingCatalog.js';

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (!getFeatureFlags().marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }
  if (req.method === 'GET') {
    sendJson(res, 200, { rail: 'PREPAID_STRIPE', currency: 'BRL', packs: Object.values(TOPUP_PACKS) });
    return;
  }
  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }
  const body = await parseBody(req);
  const pack = getTopupPack(body?.packId);
  if (!body || Array.isArray(body) || !pack) {
    sendError(res, 400, 'INVALID_INPUT', 'Selecione um pacote válido de créditos.');
    return;
  }
  const apiKey = (process.env.STRIPE_SECRET_KEY || process.env.STRIPE_API_KEY || '').trim();
  if (!apiKey) {
    sendError(res, 503, 'PAYMENT_RAIL_UNAVAILABLE', 'Pagamento indisponível. Tente novamente mais tarde.');
    return;
  }

  try {
    const store = getAgentEconomyStore();
    const authorization = req.headers.authorization || req.headers.Authorization;
    let account;
    let issuedApiKey: string | undefined;
    if (authorization) {
      const auth = await authenticateMachineRequest(authorization, 'balance:read');
      if (!auth.authenticated || !auth.context) {
        sendError(res, auth.statusCode || 401, 'AUTH_REQUIRED', 'Chave de acesso inválida ou conta indisponível.');
        return;
      }
      account = auth.context.account;
      if (body.accountId && body.accountId !== account.accountId) {
        sendError(res, 403, 'SCOPE_DENIED', 'A chave não pertence à conta informada.');
        return;
      }
    } else {
      if (body.accountId) {
        sendError(res, 401, 'AUTH_REQUIRED', 'Use a chave de acesso para recarregar uma conta existente.');
        return;
      }
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.trim().length > 100) {
        sendError(res, 400, 'INVALID_INPUT', 'Informe o nome do agente ou projeto (até 100 caracteres).');
        return;
      }
      const now = new Date().toISOString();
      account = {
        accountId: 'acc_' + crypto.randomBytes(16).toString('hex'), name: body.name.trim(),
        status: 'ACTIVE' as const, billingMode: 'PREPAID_CREDITS' as const,
        creditBalance: 0, reservedCredits: 0, spentCredits: 0,
        spendingLimit: 2000, dailyLimit: 2000, createdAt: now, updatedAt: now,
      };
      const generated = generateApiKey();
      await store.provisionAccount(account, {
        ...generated.keyRecord, accountId: account.accountId, scopes: [...BUYER_SCOPES],
      });
      issuedApiKey = generated.rawKey;
    }

    const stripe = new Stripe(apiKey);
    const publicUrl = (process.env.GXEON_PUBLIC_URL || 'https://gxeon-wallet-command-center.vercel.app').replace(/\/$/, '');
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: pack.currency, unit_amount: pack.priceCents,
          product_data: { name: 'GXEON ' + pack.name + ' — ' + pack.credits + ' créditos' },
        }, quantity: 1,
      }],
      metadata: {
        service_id: 'agent_credit_topup', account_id: account.accountId,
        credits: String(pack.credits), pack_id: pack.id,
      },
      payment_intent_data: { metadata: { service_id: 'agent_credit_topup', account_id: account.accountId, pack_id: pack.id } },
      success_url: publicUrl + '/credits?status=returned',
      cancel_url: publicUrl + '/credits?status=cancelled',
    });
    if (!session.url) throw new Error('Stripe checkout URL unavailable');
    sendJson(res, 201, {
      checkoutUrl: session.url, sessionId: session.id, pack,
      targetAccountId: account.accountId,
      ...(issuedApiKey ? { apiKey: issuedApiKey } : {}),
    });
  } catch {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'Não foi possível preparar a compra. Nenhum crédito foi cobrado. Tente novamente.');
  }
}

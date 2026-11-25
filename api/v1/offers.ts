import { GxeonOfferAgent, GxeonNegotiationEngine, AutonomousOfferRequest, NegotiationRequest } from '../../src/agent-economy/autonomous/index.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { getX402Readiness, X402_BASE_NETWORK } from '../../src/agent-economy/x402/readiness.js';
import { X402_PRICING, X402_SERVICE_PATHS } from '../../src/agent-economy/x402/pricing.js';
import { X402_PREMIUM_SERVICES } from '../../src/agent-economy/x402/premiumServices.js';
import { sendJson, sendError, parseBody } from './_helper.js';

const offerAgent = new GxeonOfferAgent();
const negotiationEngine = new GxeonNegotiationEngine();

// In-memory cache for active offers (or fallback)
const activeOffers = new Map<string, any>();

export default async function handler(req: any, res: any) {
  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  if (req.method === 'GET') {
    const list = Array.from(activeOffers.values());
    const x402 = await getX402Readiness();
    const sellable = [...listAvailableServices(), ...Object.values(X402_PREMIUM_SERVICES)]
      .filter(service => Object.prototype.hasOwnProperty.call(X402_SERVICE_PATHS, service.serviceId));
    sendJson(res, 200, {
      total: list.length + 1 + sellable.length,
      offers: list,
      canonicalOffers: [
        {
          offerId: 'off_quick_fix_v1_live',
          seller: 'GXEON',
          serviceId: 'gxeon_quick_fix_v1',
          name: 'GXEON Quick Fix',
          description: 'Diagnóstico técnico especializado e implementação de 1 correção cirúrgica.',
          amountBrl: 49.0,
          currency: 'BRL',
          paymentRail: 'stripe_live',
          checkoutEndpoint: '/v1/checkout',
          publicPaymentLink: 'https://buy.stripe.com/bJeeVd45Zgrp5EFdeV1B60b',
          status: 'ACTIVE',
        },
        ...sellable.map(service => ({
          offerId: 'off_' + service.serviceId.replace(/^gxeon_/, ''),
          seller: 'GXEON',
          serviceId: service.serviceId,
          name: service.name,
          description: service.description,
          unit: service.unit,
          unitPriceUsdc: X402_PRICING[service.serviceId].unitPriceUsdc,
          currency: 'USDC',
          paymentRail: 'x402',
          status: x402.enabled ? 'ACTIVE' : 'PAUSED',
          ...(x402.enabled ? { network: X402_BASE_NETWORK, endpoint: X402_SERVICE_PATHS[service.serviceId] } : { blocker: x402.reason }),
        })),
      ],
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed. Use GET /v1/offers, POST /v1/offers or POST /v1/negotiate');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const isNegotiate =
    url.pathname.endsWith('/negotiate') ||
    url.searchParams.get('action') === 'negotiate';

  const body = (await parseBody(req)) as any;
  if (!body) {
    sendError(res, 400, 'INVALID_INPUT', 'Request body cannot be empty');
    return;
  }

  // --- POST /v1/negotiate ---
  if (isNegotiate) {
    const proposal = body as NegotiationRequest;
    if (!proposal.offerId || !proposal.requestedQuantity || !proposal.requestedUnitPrice) {
      sendError(res, 400, 'INVALID_INPUT', 'Required fields: offerId, requestedQuantity, requestedUnitPrice');
      return;
    }

    const originalOffer = activeOffers.get(proposal.offerId);
    if (!originalOffer) {
      sendError(res, 404, 'NOT_FOUND', `Offer ${proposal.offerId} not found or expired`);
      return;
    }

    const result = negotiationEngine.negotiateOffer(originalOffer, proposal);
    if (result.counterOffer) {
      activeOffers.set(result.counterOffer.offerId, result.counterOffer);
    }
    sendJson(res, result.accepted ? 200 : 422, result);
    return;
  }

  // --- POST /v1/offers ---
  const offerReq = body as AutonomousOfferRequest;
  if (!offerReq.buyerAgentId || !offerReq.requestedCapability) {
    sendError(res, 400, 'INVALID_INPUT', 'Required fields: buyerAgentId, requestedCapability, quantity');
    return;
  }
  if (offerReq.currency === 'USDC') {
    sendError(res, 400, 'INVALID_INPUT', 'x402 uses the fixed per-call prices in GET /v1/offers.');
    return;
  }

  try {
    const offer = offerAgent.createOffer(offerReq);
    offer.paymentMethods = ['prepaid_credits'];
    activeOffers.set(offer.offerId, offer);
    sendJson(res, 201, offer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 400, 'INVALID_INPUT', msg);
  }
}

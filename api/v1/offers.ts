import { GxeonOfferAgent, GxeonNegotiationEngine, AutonomousOfferRequest, NegotiationRequest } from '../../src/agent-economy/autonomous/index.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
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
    sendJson(res, 200, {
      total: list.length + 3,
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
        {
          offerId: 'off_json_validate_v1',
          seller: 'GXEON',
          serviceId: 'gxeon_json_validate_v1',
          name: 'GXEON JSON Validate',
          description: 'High-performance JSON syntax validation and schema conformance verification.',
          unitPriceUsdc: 0.01,
          currency: 'USDC',
          paymentRail: 'x402',
          status: 'PAUSED',
          blocker: 'x402 treasury ownership verification is required before USDC settlement is advertised as live.',
        },
        {
          offerId: 'off_url_verify_v1',
          seller: 'GXEON',
          serviceId: 'gxeon_url_verify_v1',
          name: 'GXEON URL Verify',
          description: 'Batch public URL verification with strict anti-SSRF defense.',
          unitPriceUsdc: 0.025,
          currency: 'USDC',
          paymentRail: 'x402',
          status: 'PAUSED',
          blocker: 'x402 treasury ownership verification is required before USDC settlement is advertised as live.',
        },
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

  try {
    const offer = offerAgent.createOffer(offerReq);
    activeOffers.set(offer.offerId, offer);
    sendJson(res, 201, offer);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    sendError(res, 400, 'INVALID_INPUT', msg);
  }
}

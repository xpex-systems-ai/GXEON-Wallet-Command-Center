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

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed. Use POST /v1/offers or POST /v1/negotiate');
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

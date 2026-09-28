import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError } from './_helper.js';

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.toLowerCase();
  const view = url.searchParams.get('view') || '';

  // GET /v1/pricing
  if (path.endsWith('/pricing') || view === 'pricing') {
    sendJson(res, 200, {
      pricing: [
        {
          serviceId: 'gxeon_url_verify_v1',
          name: 'GXEON URL Verify',
          unit: 'url',
          unitPriceCredits: 5,
          unitPriceUsdc: 0.025,
          minimumChargeCredits: 5,
          minimumChargeUsdc: 0.025,
        },
        {
          serviceId: 'gxeon_json_validate_v1',
          name: 'GXEON JSON Validate',
          unit: 'payload',
          unitPriceCredits: 2,
          unitPriceUsdc: 0.01,
          minimumChargeCredits: 2,
          minimumChargeUsdc: 0.01,
        },
      ],
      billingRails: ['prepaid_credits', 'x402'],
    });
    return;
  }

  // GET /v1/payment-methods
  if (path.endsWith('/payment-methods') || view === 'payment-methods') {
    sendJson(res, 200, {
      paymentMethods: [
        {
          rail: 'prepaid_credits',
          currency: 'BRL',
          description: 'Top-up credits via Stripe Live Checkout (Pix / Card)',
          topupEndpoint: '/api/v1/billing/topup',
        },
        {
          rail: 'x402',
          currency: 'USDC',
          protocolVersion: 2,
          description: 'Native per-call machine payment via Base (EVM) or Solana',
          supportedNetworks: ['eip155:8453', 'solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp'],
          gateways: {
            'gxeon_url_verify_v1': '/x402/url-verify',
            'gxeon_json_validate_v1': '/x402/json-validate',
          },
        },
      ],
    });
    return;
  }

  // GET /v1/capabilities or GET /v1/services
  const services = listAvailableServices();
  sendJson(res, 200, {
    capabilities: services.map((s) => s.serviceId),
    services: services.map((s) => ({
      serviceId: s.serviceId,
      version: s.version,
      name: s.name,
      description: s.description,
      inputSchema: s.inputSchema,
      outputSchema: s.outputSchema,
      unit: s.unit,
      unitPriceCredits: s.unitPriceCredits,
      minimumChargeCredits: s.minimumChargeCredits,
      maxBatch: s.maxBatch,
      status: s.status,
    })),
  });
}

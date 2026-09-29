import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import {
  generateTreasuryChallenge,
  verifyTreasurySignature,
} from '../../src/agent-economy/x402/treasuryVerifier.js';
import { checkBazaarVisibility } from '../../src/agent-economy/connectors/x402BazaarConnector.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.toLowerCase();
  const view = url.searchParams.get('view') || '';

  // POST /v1/treasury/verify or ?view=treasury-verify
  if (path.endsWith('/treasury/verify') || view === 'treasury-verify') {
    if (req.method !== 'POST') {
      sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed. Use POST.');
      return;
    }
    const body = await parseBody(req);
    if (!body || !body.address || !body.challenge || !body.signature) {
      sendError(
        res,
        400,
        'INVALID_INPUT',
        'Missing required fields: address, challenge, signature'
      );
      return;
    }

    const verification = await verifyTreasurySignature({
      address: body.address,
      challenge: body.challenge,
      signature: body.signature,
    });

    if (!verification.verified) {
      sendError(
        res,
        400,
        'TREASURY_UNVERIFIED' as any,
        verification.error || 'Treasury signature verification failed',
        { recoveredAddress: verification.recoveredAddress }
      );
      return;
    }

    sendJson(res, 200, {
      verified: true,
      recoveredAddress: verification.recoveredAddress,
      record: verification.record,
      instructions:
        'Treasury ownership successfully verified and persisted. Set GXEON_X402_BASE_PAYTO to this address and GXEON_TREASURY_VERIFIED=true in your environment to enable live x402 sales.',
    });
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  // GET /v1/treasury/challenge or ?view=treasury-challenge
  if (path.endsWith('/treasury/challenge') || view === 'treasury-challenge') {
    const address =
      url.searchParams.get('address') || process.env.GXEON_X402_BASE_PAYTO || '';
    if (!address) {
      sendError(
        res,
        400,
        'INVALID_INPUT',
        'Missing address parameter (?address=0x...). Must be a valid Base wallet address.'
      );
      return;
    }

    try {
      const challengeData = generateTreasuryChallenge(address);
      sendJson(res, 200, {
        ...challengeData,
        instructions:
          'Sign this challenge message with your personal Base wallet using personal_sign / signMessage. Then POST /v1/treasury/verify with { address, challenge, signature }.',
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      sendError(res, 400, 'SECURITY_VIOLATION' as any, msg);
    }
    return;
  }

  // GET /v1/bazaar/discovery or ?view=bazaar-discovery
  if (path.endsWith('/bazaar/discovery') || view === 'bazaar-discovery') {
    const payTo =
      url.searchParams.get('payTo') || process.env.GXEON_X402_BASE_PAYTO || '';
    const result = await checkBazaarVisibility(payTo);
    sendJson(res, 200, result);
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  // GET /v1/pricing
  if (path.endsWith('/pricing') || view === 'pricing') {
    sendJson(res, 200, {

      pricing: [
        {
          serviceId: 'gxeon_quick_fix_v1',
          name: 'GXEON Quick Fix',
          description: 'Diagnóstico técnico especializado e implementação de 1 correção cirúrgica.',
          unit: 'job',
          unitPriceBrl: 49.0,
          currency: 'BRL',
          minimumChargeBrl: 49.0,
          billingRail: 'stripe_live',
          checkoutEndpoint: '/v1/checkout',
          publicPaymentLink: 'https://buy.stripe.com/bJeeVd45Zgrp5EFdeV1B60b',
        },
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
      billingRails: ['stripe_live', 'prepaid_credits', 'x402'],
    });
    return;
  }

  // GET /v1/payment-methods
  if (path.endsWith('/payment-methods') || view === 'payment-methods') {
    sendJson(res, 200, {
      paymentMethods: [
        {
          rail: 'stripe_live',
          currency: 'BRL',
          description: 'Stripe Live Checkout for developer and enterprise direct payments (R$49.00)',
          checkoutEndpoint: '/v1/checkout',
          publicPaymentLink: 'https://buy.stripe.com/bJeeVd45Zgrp5EFdeV1B60b',
        },
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

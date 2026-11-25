import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import {
  generateTreasuryChallenge,
  getTreasuryVerificationConfig,
  verifyTreasurySignature,
} from '../../src/agent-economy/x402/treasuryVerifier.js';
import { getAgentEconomyStore } from '../../src/agent-economy/store.js';
import { checkBazaarVisibility } from '../../src/agent-economy/connectors/x402BazaarConnector.js';
import { getX402Readiness, hasBaseWalletProof, X402_BASE_NETWORK } from '../../src/agent-economy/x402/readiness.js';
import { X402_SERVICE_PATHS, X402_PRICING } from '../../src/agent-economy/x402/pricing.js';
import { handleZylaCsvAudit } from './_zylaCsvAudit.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname.toLowerCase();
  const view = url.searchParams.get('view') || '';

  if (path === '/api/zyla-csv-audit' || view === 'zyla-csv-audit') {
    return handleZylaCsvAudit(req, res);
  }

  // POST /v1/treasury/verify or ?view=treasury-verify
  if (path.endsWith('/treasury/verify') || view === 'treasury-verify') {
    res.setHeader('Cache-Control', 'no-store');
    if (req.method !== 'POST') {
      sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed. Use POST.');
      return;
    }
    const body = await parseBody(req);
    if (typeof body?.address !== 'string' || typeof body.challenge !== 'string' || typeof body.signature !== 'string') {
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
      walletProvider: body.walletProvider === 'metamask' || body.walletProvider === 'coinbase_wallet'
        ? body.walletProvider : 'browser_wallet',
    });

    if (!verification.verified) {
      sendError(
        res,
        verification.unavailable ? 503 : 400,
        verification.unavailable ? 'SERVICE_UNAVAILABLE' : 'TREASURY_UNVERIFIED',
        verification.error || 'Treasury signature verification failed'
      );
      return;
    }

    sendJson(res, 200, {
      verified: true,
      recoveredAddress: verification.recoveredAddress,
      verifiedAt: verification.record?.verified_at,
      chainId: verification.record?.chain_id,
      instructions:
        'Treasury ownership verified and recorded. See /v1/payment-methods for current settlement availability.',
    });
    return;
  }

  if (req.method !== 'GET') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  // GET /v1/treasury/status
  if (path.endsWith('/treasury/status') || view === 'treasury-status') {
    res.setHeader('Cache-Control', 'no-store');
    const config = getTreasuryVerificationConfig();
    if (!config) {
      sendJson(res, 200, { configured: false, walletVerified: false, x402Enabled: false });
      return;
    }
    try {
      const record = await getAgentEconomyStore().getTreasuryVerification(config.address);
      const walletVerified = hasBaseWalletProof(record, config.address);
      const x402 = await getX402Readiness(record);
      sendJson(res, 200, {
        configured: true,
        walletVerified,
        verifiedAt: walletVerified ? record?.verified_at : null,
        x402Enabled: x402.enabled,
        ...(x402.enabled ? {
          x402FacilitatorAuthentication: x402.facilitatorAuthentication,
          x402FacilitatorCredentialSource: x402.facilitatorCredentialSource,
        } : {}),
      });
    } catch {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'O registro de verificação está indisponível. Tente novamente.');
    }
    return;
  }

  // GET /v1/treasury/challenge or ?view=treasury-challenge
  if (path.endsWith('/treasury/challenge') || view === 'treasury-challenge') {
    res.setHeader('Cache-Control', 'no-store');
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

    if (!getTreasuryVerificationConfig()) {
      sendError(res, 503, 'SERVICE_UNAVAILABLE', 'A verificação da carteira ainda está indisponível.');
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
      sendError(res, 400, 'INVALID_INPUT', msg);
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
    const { enabled } = await getX402Readiness();
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
          minimumChargeCredits: 5,
        },
        {
          serviceId: 'gxeon_json_validate_v1',
          name: 'GXEON JSON Validate',
          unit: 'payload',
          unitPriceCredits: 2,
          minimumChargeCredits: 2,
          ...(enabled ? { unitPriceUsdc: X402_PRICING.gxeon_json_validate_v1.unitPriceUsdc } : {}),
        },
        {
          serviceId: 'gxeon_api_health_v1',
          name: 'GXEON API Health',
          unit: 'endpoint',
          unitPriceCredits: 10,
          minimumChargeCredits: 10,
          billingRail: 'prepaid_credits',
        },
        {
          serviceId: 'gxeon_csv_audit_v1',
          name: 'GXEON CSV Audit',
          unit: 'file',
          unitPriceCredits: 2,
          minimumChargeCredits: 2,
          billingRail: 'prepaid_credits',
          entryPack: 'PICO',
          entryPriceBrl: 0.99,
          ...(enabled ? { unitPriceUsdc: X402_PRICING.gxeon_csv_audit_v1.unitPriceUsdc } : {}),
        },
      ],
      billingRails: [
        'stripe_live',
        'prepaid_credits',
        ...(enabled ? ['x402'] : []),
      ],
    });
    return;
  }

  // GET /v1/payment-methods
  if (path.endsWith('/payment-methods') || view === 'payment-methods') {
    const x402 = await getX402Readiness();
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
          description: 'Prepaid agent request packs from R$ 0,99 via Stripe Live Checkout. No subscription.',
          packsEndpoint: '/v1/billing/topup',
          topupEndpoint: '/v1/billing/topup',
        },
        {
          rail: 'x402',
          currency: 'USDC',
          protocolVersion: 2,
          enabled: x402.enabled,
          status: x402.enabled ? 'ACTIVE' : 'CONFIGURATION_REQUIRED',
          description: 'USDC per call, with a confirmed transfer on Base required for delivery.',
          supportedNetworks: x402.enabled ? [X402_BASE_NETWORK] : [],
          gateways: x402.enabled ? X402_SERVICE_PATHS : {},
          ...(x402.enabled ? {
            facilitator: x402.facilitator,
            facilitatorAuthentication: x402.facilitatorAuthentication,
            facilitatorCredentialSource: x402.facilitatorCredentialSource,
          } : { blocker: x402.reason }),
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

import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { TOPUP_PACKS } from '../../src/agent-economy/billingCatalog.js';
import { sendJson, sendError, parseBody } from './_helper.js';

const SUPPORTED_PROTOCOLS = new Set(['2026-07-28', '2025-11-25', '2025-06-18']);

const tools = [
  {
    name: 'gxeon_list_services',
    description:
      'List currently available GXEON capabilities and their prepaid credit economics. Read-only and no authentication required.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'gxeon_list_credit_packs',
    description:
      'List prepaid GXEON request packs from the live catalog. Read-only and does not create a checkout or spend money.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: 'gxeon_get_agent_buying_guide',
    description:
      'Return the official machine buyer flow for creating a prepaid account, completing Stripe Checkout, and using the resulting machine key after verified settlement.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
];

function rpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function rpcError(id: unknown, code: number, message: string) {
  return { jsonrpc: '2.0', id: id ?? null, error: { code, message } };
}

function toolResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

function liveServices() {
  return listAvailableServices().map(service => ({
    serviceId: service.serviceId,
    name: service.name,
    description: service.description,
    unit: service.unit,
    unitPriceCredits: service.unitPriceCredits,
    minimumChargeCredits: service.minimumChargeCredits,
    maxBatch: service.maxBatch,
    status: service.status,
  }));
}

function buyingGuide() {
  return {
    market: 'GXEON Agent Capability Market',
    currency: 'BRL',
    rail: 'PREPAID_STRIPE',
    catalogEndpoint: '/v1/billing/topup',
    createCheckoutEndpoint: '/v1/billing/topup',
    executionMcpEndpoint: '/api/v1/mcp',
    firstPurchase: [
      'POST /v1/billing/topup with {packId,name}.',
      'Save the one-time GXEON API key returned on first account creation.',
      'Complete the Stripe-hosted checkout using an authorized payment method.',
      'Wait for provider-verified settlement before assuming credits exist.',
      'Use Authorization: Bearer <GXEON_API_KEY> with the authenticated MCP or REST execution endpoints.',
    ],
    moneyTruth:
      'Catalog discovery and Checkout creation are not payment. Credits become spendable only after GXEON verifies provider settlement.',
    safety:
      'Never place a GXEON API key in a public plugin package, shared prompt, source repository, or public log.',
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    sendJson(res, 200, {
      name: 'gxeon-public-market',
      version: '1.0.0',
      protocol: 'MCP Streamable HTTP / JSON-RPC',
      endpoint: '/api/v1/public-mcp',
      authentication: 'none',
      scope: 'Read-only marketplace discovery and buying guidance',
      tools: tools.map(tool => tool.name),
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const body = await parseBody(req);
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    sendJson(res, 400, rpcError(body?.id, -32600, 'Invalid Request'));
    return;
  }

  const id = body.id ?? null;

  if (body.method === 'notifications/initialized') {
    res.statusCode = 202;
    res.end();
    return;
  }

  if (body.method === 'initialize') {
    const requested =
      typeof body.params?.protocolVersion === 'string'
        ? body.params.protocolVersion
        : '2026-07-28';
    const protocolVersion = SUPPORTED_PROTOCOLS.has(requested)
      ? requested
      : '2026-07-28';

    sendJson(
      res,
      200,
      rpcResult(id, {
        protocolVersion,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'gxeon-public-market', version: '1.0.0' },
        instructions:
          'Use this no-auth MCP only for discovery. Creating a checkout or executing paid work requires the documented GXEON buyer flow.',
      })
    );
    return;
  }

  if (body.method === 'ping') {
    sendJson(res, 200, rpcResult(id, {}));
    return;
  }

  if (body.method === 'tools/list') {
    sendJson(res, 200, rpcResult(id, { tools }));
    return;
  }

  if (body.method !== 'tools/call') {
    sendJson(res, 200, rpcError(id, -32601, 'Method not found'));
    return;
  }

  const name = body.params?.name;
  if (name === 'gxeon_list_services') {
    sendJson(res, 200, rpcResult(id, toolResult({ services: liveServices() })));
    return;
  }

  if (name === 'gxeon_list_credit_packs') {
    sendJson(
      res,
      200,
      rpcResult(
        id,
        toolResult({
          rail: 'PREPAID_STRIPE',
          currency: 'BRL',
          packs: Object.values(TOPUP_PACKS),
          moneyTruth:
            'Listing a pack does not create a charge. Credits are granted only after provider-verified settlement.',
        })
      )
    );
    return;
  }

  if (name === 'gxeon_get_agent_buying_guide') {
    sendJson(res, 200, rpcResult(id, toolResult(buyingGuide())));
    return;
  }

  sendJson(
    res,
    200,
    rpcResult(id, {
      content: [{ type: 'text', text: 'Unknown GXEON public-market tool.' }],
      structuredContent: { error: 'UNKNOWN_TOOL' },
      isError: true,
    })
  );
}

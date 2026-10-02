import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { handleMcpRpc, JsonRpcRequest } from '../../src/agent-economy/mcpGateway.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { TOPUP_PACKS } from '../../src/agent-economy/billingCatalog.js';
import { listAvailableServices } from '../../src/agent-economy/services/registry.js';
import { sendJson, sendError, parseBody } from './_helper.js';
import type { AgentScope } from '../../src/agent-economy/types.js';

const BUYER_TOOLS: Record<string, AgentScope> = {
  list_services: 'services:read', list_credit_packs: 'services:read', get_quote: 'quotes:create', submit_job: 'jobs:create',
  get_job: 'jobs:read', get_result: 'results:read', get_balance: 'balance:read',
  gxeon_json_validate_v1: 'jobs:create', gxeon_url_verify_v1: 'jobs:create',
};

const PUBLIC_MARKET_TOOLS = [
  {
    name: 'gxeon_list_services',
    description: 'List currently available GXEON capabilities and prepaid-credit economics. Read-only.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'gxeon_list_credit_packs',
    description: 'List live prepaid GXEON request packs. Read-only; does not create a checkout or spend money.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
  {
    name: 'gxeon_get_agent_buying_guide',
    description: 'Return the official GXEON machine-buyer flow for prepaid execution.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
  },
];

function publicRpcResult(id: unknown, result: unknown) {
  return { jsonrpc: '2.0', id: id ?? null, result };
}

function publicToolResult(value: unknown) {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value,
    isError: false,
  };
}

async function handlePublicMarketMcp(req: any, res: any) {
  if (req.method === 'GET') {
    sendJson(res, 200, {
      name: 'gxeon-public-market',
      version: '1.0.0',
      endpoint: '/api/v1/mcp?view=public-market',
      authentication: 'none',
      scope: 'Read-only marketplace discovery and buying guidance',
      tools: PUBLIC_MARKET_TOOLS.map(tool => tool.name),
    });
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const body = await parseBody(req);
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid Request' },
    });
    return;
  }

  if (body.method === 'notifications/initialized') {
    res.statusCode = 202;
    res.end();
    return;
  }

  if (body.method === 'initialize') {
    sendJson(res, 200, publicRpcResult(body.id, {
      protocolVersion:
        typeof body.params?.protocolVersion === 'string'
          ? body.params.protocolVersion
          : '2026-07-28',
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'gxeon-public-market', version: '1.0.0' },
      instructions:
        'This endpoint is no-auth and read-only. Use it only to discover services, packs, and the documented buying flow.',
    }));
    return;
  }

  if (body.method === 'ping') {
    sendJson(res, 200, publicRpcResult(body.id, {}));
    return;
  }

  if (body.method === 'tools/list') {
    sendJson(res, 200, publicRpcResult(body.id, { tools: PUBLIC_MARKET_TOOLS }));
    return;
  }

  if (body.method !== 'tools/call') {
    sendJson(res, 200, {
      jsonrpc: '2.0',
      id: body.id ?? null,
      error: { code: -32601, message: 'Method not found' },
    });
    return;
  }

  const name = body.params?.name;
  if (name === 'gxeon_list_services') {
    sendJson(res, 200, publicRpcResult(body.id, publicToolResult({
      services: listAvailableServices().map(service => ({
        serviceId: service.serviceId,
        name: service.name,
        description: service.description,
        unit: service.unit,
        unitPriceCredits: service.unitPriceCredits,
        minimumChargeCredits: service.minimumChargeCredits,
        maxBatch: service.maxBatch,
        status: service.status,
      })),
    })));
    return;
  }

  if (name === 'gxeon_list_credit_packs') {
    sendJson(res, 200, publicRpcResult(body.id, publicToolResult({
      rail: 'PREPAID_STRIPE',
      currency: 'BRL',
      packs: Object.values(TOPUP_PACKS),
      moneyTruth:
        'Listing a pack does not create a charge. Credits become spendable only after provider-verified settlement.',
    })));
    return;
  }

  if (name === 'gxeon_get_agent_buying_guide') {
    sendJson(res, 200, publicRpcResult(body.id, publicToolResult({
      market: 'GXEON Agent Capability Market',
      catalogEndpoint: '/v1/billing/topup',
      createCheckoutEndpoint: '/v1/billing/topup',
      publicDiscoveryMcp: '/api/v1/mcp?view=public-market',
      executionMcpEndpoint: '/api/v1/mcp',
      firstPurchase: [
        'POST /v1/billing/topup with {packId,name}.',
        'Save the one-time GXEON API key returned on first account creation.',
        'Complete Stripe Checkout using an authorized payment method.',
        'Wait for provider-verified settlement before assuming credits exist.',
        'Use the saved GXEON key with the authenticated MCP/REST execution endpoints.',
      ],
      moneyTruth:
        'Catalog discovery and Checkout creation are not payment. Credits become spendable only after GXEON verifies provider settlement.',
      safety:
        'Never place a GXEON API key in a public plugin package, shared prompt, source repository, or public log.',
    })));
    return;
  }

  sendJson(res, 200, publicRpcResult(body.id, {
    content: [{ type: 'text', text: 'Unknown GXEON public-market tool.' }],
    structuredContent: { error: 'UNKNOWN_TOOL' },
    isError: true,
  }));
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url || '/api/v1/mcp', 'http://localhost');
  if (url.searchParams.get('view') === 'public-market') {
    await handlePublicMarketMcp(req, res);
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const flags = getFeatureFlags();
  if (!flags.marketEnabled) {
    sendError(res, 503, 'SERVICE_UNAVAILABLE', 'GXEON Agent Capability Market is disabled');
    return;
  }

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const auth = await authenticateMachineRequest(authHeader);
  if (!auth.authenticated || !auth.context) {
    const status = auth.statusCode || 401;
    const err = auth.error?.error || { code: 'AUTH_REQUIRED', message: 'Authentication failed' };
    sendError(res, status, err.code, err.message);
    return;
  }

  const body = (await parseBody(req)) as JsonRpcRequest;
  if (!body || body.jsonrpc !== '2.0' || !body.method) {
    sendJson(res, 400, {
      jsonrpc: '2.0',
      id: body?.id ?? null,
      error: { code: -32600, message: 'Invalid JSON-RPC 2.0 Request' },
    });
    return;
  }

  const scopes = auth.context.apiKey.scopes;
  const isAdmin = scopes.includes('admin:*');
  const toolName = body.method === 'tools/call'
    ? String(body.params?.name || '')
    : body.method.startsWith('gxeon.') ? body.method.slice(6) : null;
  if (!isAdmin && toolName !== null && (!BUYER_TOOLS[toolName] || !scopes.includes(BUYER_TOOLS[toolName]))) {
    sendError(res, 403, 'SCOPE_DENIED', 'This API key does not grant access to this tool');
    return;
  }
  if (body.method === 'notifications/initialized') {
    res.statusCode = 202;
    res.end();
    return;
  }
  const response = await handleMcpRpc(body, auth.context.account.accountId);
  if (!isAdmin && ['tools/list', 'gxeon.list_services'].includes(body.method) && response.result) {
    const result = response.result as { tools?: Array<{ name: string }> };
    result.tools = result.tools?.filter(tool => BUYER_TOOLS[tool.name] && scopes.includes(BUYER_TOOLS[tool.name]));
  }
  sendJson(res, 200, response);
}

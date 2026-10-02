import { listAvailableServices } from '../src/agent-economy/services/registry.js';
import { TOPUP_PACKS } from '../src/agent-economy/billingCatalog.js';
import { parseBody, sendError, sendJson } from './v1/_helper.js';

const ORIGIN = 'https://gxeon-wallet-command-center.vercel.app';
const A2A_ENDPOINT = ORIGIN + '/a2a';

function agentCard() {
  return {
    protocolVersion: '1.0',
    name: 'GXEON Agent Capability Market',
    description: 'Public, read-only discovery agent for GXEON API capabilities and prepaid request packs. It never creates checkout sessions, spends funds, or exposes credentials.',
    url: A2A_ENDPOINT,
    version: '1.0.0',
    capabilities: { streaming: false, pushNotifications: false },
    defaultInputModes: ['text/plain'],
    defaultOutputModes: ['text/plain', 'application/json'],
    skills: [
      {
        id: 'discover-gxeon-services',
        name: 'Discover GXEON services',
        description: 'Returns the current public service catalog, usage units, and prepaid-credit prices.',
        tags: ['api', 'json-validation', 'url-verification', 'api-health', 'marketplace'],
        examples: ['What GXEON services are available?', 'List the current GXEON API capability catalog.'],
      },
      {
        id: 'discover-gxeon-credit-packs',
        name: 'Discover GXEON credit packs',
        description: 'Returns current prepaid packs and the verified settlement rule before credits are usable.',
        tags: ['pricing', 'stripe', 'prepaid-credits', 'agent-commerce'],
        examples: ['Show GXEON prepaid credit packs.', 'How can an agent buy GXEON execution credits?'],
      },
    ],
  };
}

function publicCatalog() {
  return {
    market: 'GXEON Agent Capability Market',
    discovery: {
      mcp: ORIGIN + '/api/v1/mcp?view=public-market',
      a2a: ORIGIN + '/.well-known/agent.json',
      docs: ORIGIN + '/market',
    },
    services: listAvailableServices().map((service) => ({
      serviceId: service.serviceId,
      name: service.name,
      description: service.description,
      unit: service.unit,
      unitPriceCredits: service.unitPriceCredits,
      minimumChargeCredits: service.minimumChargeCredits,
      maxBatch: service.maxBatch,
      status: service.status,
    })),
    creditPacks: Object.values(TOPUP_PACKS),
    buyingGuide: [
      'Choose a prepaid pack through the authenticated GXEON buying flow.',
      'Complete checkout only with an authorized payment method.',
      'Treat credits as unavailable until provider-verified settlement.',
      'Use the authenticated MCP or REST endpoint only with the private API key returned to the buyer.',
    ],
    moneyTruth: 'This A2A bridge is discovery-only. It does not create checkout, process payment, issue credits, or execute paid jobs.',
  };
}

function completeTask(id: unknown, params: any) {
  const catalog = publicCatalog();
  const taskId = 'gxeon-public-market-' + crypto.randomUUID();
  return {
    jsonrpc: '2.0',
    id: id ?? null,
    result: {
      id: taskId,
      contextId: params?.message?.contextId || taskId,
      status: { state: 'completed' },
      artifacts: [{
        artifactId: 'public-market-catalog',
        name: 'GXEON public market catalog',
        parts: [
          { kind: 'text', text: JSON.stringify(catalog, null, 2) },
          { kind: 'data', data: catalog },
        ],
      }],
    },
  };
}

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');

  const url = new URL(req.url || '/api/a2a', ORIGIN);
  if (req.method === 'GET' && url.searchParams.get('view') === 'card') {
    sendJson(res, 200, agentCard());
    return;
  }

  if (req.method !== 'POST') {
    sendError(res, 405, 'INVALID_INPUT', 'Method Not Allowed');
    return;
  }

  const body = await parseBody(req);
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') {
    sendJson(res, 400, { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
    return;
  }

  if (body.method === 'message/send') {
    sendJson(res, 200, completeTask(body.id, body.params));
    return;
  }

  if (body.method === 'ping') {
    sendJson(res, 200, { jsonrpc: '2.0', id: body.id ?? null, result: {} });
    return;
  }

  sendJson(res, 200, {
    jsonrpc: '2.0',
    id: body.id ?? null,
    error: { code: -32601, message: 'Method not found. Supported methods: message/send, ping.' },
  });
}

import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { handleMcpRpc, JsonRpcRequest } from '../../src/agent-economy/mcpGateway.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from './_helper.js';
import type { AgentScope } from '../../src/agent-economy/types.js';

const BUYER_TOOLS: Record<string, AgentScope> = {
  list_services: 'services:read', get_quote: 'quotes:create', submit_job: 'jobs:create',
  get_job: 'jobs:read', get_result: 'results:read', get_balance: 'balance:read',
  gxeon_json_validate_v1: 'jobs:create', gxeon_url_verify_v1: 'jobs:create',
};

export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
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

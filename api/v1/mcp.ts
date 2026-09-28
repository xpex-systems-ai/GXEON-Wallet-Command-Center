import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { handleMcpRpc, JsonRpcRequest } from '../../src/agent-economy/mcpGateway.js';
import { getFeatureFlags } from '../../src/agent-economy/featureFlags.js';
import { sendJson, sendError, parseBody } from './_helper.js';

export default async function handler(req: any, res: any) {
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

  const response = await handleMcpRpc(body, auth.context.account.accountId);
  sendJson(res, 200, response);
}

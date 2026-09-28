import { authenticateMachineRequest } from '../../src/agent-economy/auth.js';
import { getAccountBalance } from '../../src/agent-economy/ledger.js';
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

  const authHeader = req.headers.authorization || req.headers.Authorization;
  const auth = await authenticateMachineRequest(authHeader, 'balance:read');
  if (!auth.authenticated || !auth.context) {
    const status = auth.statusCode || 401;
    const err = auth.error?.error || { code: 'AUTH_REQUIRED', message: 'Authentication failed' };
    sendError(res, status, err.code, err.message);
    return;
  }

  const { account } = auth.context;
  const balance = await getAccountBalance(account.accountId);
  if (!balance) {
    sendError(res, 404, 'INVALID_INPUT', 'Account not found');
    return;
  }

  sendJson(res, 200, {
    accountId: account.accountId,
    ...balance,
  });
}

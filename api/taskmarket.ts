import { readTaskmarketStatus } from '../src/agent-economy/taskmarket/taskmarketRadar.js';
import { callTaskmarketTool } from '../src/agent-economy/taskmarket/mcpTools.js';
import { sendJson } from './v1/_helper.js';

export const config = { maxDuration: 300 };
export default async function handler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'READ_ONLY_ENDPOINT' });
  const url = new URL(req.url || '/', 'https://gxeon-wallet-command-center.vercel.app');
  const view = url.searchParams.get('view') || 'status';
  try {
    if (view === 'status') return sendJson(res, 200, await readTaskmarketStatus(url.searchParams.get('live') === '1'));
    const allowed: Record<string, string> = { task: 'get_task', qualify: 'qualify_task', preview: 'action_preview', network: 'network_status', legal: 'legal_status', identity: 'identity_status' };
    if (!allowed[view]) return sendJson(res, 400, { error: 'UNKNOWN_VIEW' });
    const args = ['network', 'legal', 'identity'].includes(view) ? {} : { taskId: url.searchParams.get('taskId'), ...(view === 'preview' ? { action: url.searchParams.get('action') } : {}) };
    return sendJson(res, 200, await callTaskmarketTool(`taskmarket_${allowed[view]}`, args));
  } catch (error) {
    return sendJson(res, 503, { error: error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'TASKMARKET_READ_UNAVAILABLE' });
  }
}

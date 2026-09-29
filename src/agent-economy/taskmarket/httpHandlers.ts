import { readTaskmarketStatus } from './taskmarketRadar.js';
import { callTaskmarketTool } from './mcpTools.js';
import { sendJson } from '../../../api/v1/_helper.js';

export async function taskmarketReadHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'READ_ONLY_ENDPOINT' });
  const url = new URL(req.url || '/', 'https://gxeon-wallet-command-center.vercel.app');
  const view = url.searchParams.get('view') || 'status';
  try {
    if (view === 'release') {
      const sha = process.env.VERCEL_GIT_COMMIT_SHA || '';
      return sendJson(res, 200, { deployedCommit: /^[a-f0-9]{40}$/i.test(sha) ? sha : null });
    }
    if (view === 'status') return sendJson(res, 200, await readTaskmarketStatus(url.searchParams.get('live') === '1'));
    const allowed: Record<string, string> = { task: 'get_task', qualify: 'qualify_task', preview: 'action_preview', network: 'network_status', legal: 'legal_status', identity: 'identity_status' };
    if (!allowed[view]) return sendJson(res, 400, { error: 'UNKNOWN_VIEW' });
    const args = ['network', 'legal', 'identity'].includes(view) ? {} : { taskId: url.searchParams.get('taskId'), ...(view === 'preview' ? { action: url.searchParams.get('action') } : {}) };
    return sendJson(res, 200, await callTaskmarketTool(`taskmarket_${allowed[view]}`, args));
  } catch (error) {
    return sendJson(res, 503, { error: error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'TASKMARKET_READ_UNAVAILABLE' });
  }
}

import { authorizeRadarPoll } from './schedulerAuth.js';
import { pollTaskmarket } from './taskmarketRadar.js';
import { refreshUnifiedPaidRadar } from './unifiedRadar.js';

export async function taskmarketPollHandler(req: any, res: any) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST' && req.method !== 'GET') return sendJson(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (!await authorizeRadarPoll(req.headers.authorization)) return sendJson(res, 401, { error: 'SCHEDULER_AUTH_REQUIRED' });
  try {
    const taskmarket = await pollTaskmarket();
    const unified = await refreshUnifiedPaidRadar(taskmarket);
    return sendJson(res, taskmarket.errors.length ? 503 : 200, {
      ok: taskmarket.errors.length === 0, fetchedAt: taskmarket.fetchedAt,
      openTasks: taskmarket.openTasks, fundedTasks: taskmarket.fundedTasksAvailable, qualified: taskmarket.qualifiedTasksAvailable,
      paidTasks: taskmarket.paidTasks, totalSettledUsdc: taskmarket.totalSettledUsdc,
      providerStatus: unified.providers, errors: taskmarket.errors, marketplaceWritesPerformed: 0,
    });
  } catch { return sendJson(res, 503, { error: 'RADAR_POLL_OR_DURABLE_STORE_UNAVAILABLE' }); }
}

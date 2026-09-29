import { authorizeRadarPoll } from '../../src/agent-economy/taskmarket/schedulerAuth.js';
import { pollTaskmarket } from '../../src/agent-economy/taskmarket/taskmarketRadar.js';
import { refreshUnifiedPaidRadar } from '../../src/agent-economy/taskmarket/unifiedRadar.js';
import { sendJson } from '../v1/_helper.js';

export const config = { maxDuration: 300 };
export default async function handler(req: any, res: any) {
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

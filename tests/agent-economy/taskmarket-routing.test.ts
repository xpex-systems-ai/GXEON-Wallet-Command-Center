import { describe, it, expect, vi } from 'vitest';
import handler from '../../api/v1/radar.js';
function response() { return { statusCode: 0, setHeader: vi.fn(), end: vi.fn() }; }
describe('Taskmarket routes share the existing radar function safely', () => {
  it('exposes only a validated public deployment commit for the poll release gate', async () => {
    try {
      for (const value of ['a'.repeat(40), 'not-a-commit']) {
        vi.stubEnv('VERCEL_GIT_COMMIT_SHA', value);
        const res = response();
        await handler({ method: 'GET', url: '/api/taskmarket?view=release', headers: {} }, res);
        expect(res.statusCode).toBe(200);
        expect(res.end).toHaveBeenCalledWith(JSON.stringify({ deployedCommit: value.length === 40 ? value : null }));
      }
    } finally { vi.unstubAllEnvs(); }
  });
  it('rejects public writes through the rewrite destination', async () => {
    const res = response();
    await handler({ method: 'POST', url: '/api/v1/radar?gxeonView=taskmarket', headers: {} }, res);
    expect(res.statusCode).toBe(405); expect(res.end).toHaveBeenCalledWith(JSON.stringify({ error: 'READ_ONLY_ENDPOINT' }));
  });
  it('still authenticates polling through the rewrite and original URL', async () => {
    for (const req of [{ method: 'POST', url: '/api/v1/radar', query: { gxeonView: 'taskmarket-poll' }, headers: {} },
      { method: 'POST', url: '/api/cron/taskmarket-radar', headers: {} }]) {
      const res = response(); await handler(req, res); expect(res.statusCode).toBe(401);
    }
  });
});

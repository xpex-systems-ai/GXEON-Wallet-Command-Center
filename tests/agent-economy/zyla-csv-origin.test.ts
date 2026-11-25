import { afterEach, describe, expect, it, vi } from 'vitest';
import handler from '../../api/v1/services.js';

const secret = 'synthetic-preview-key-for-local-tests';
const csv = { csv: 'id,name\n1,Ana\n2,', hasHeader: true };

async function invoke(url: string, method: string, key?: string, body: unknown = csv) {
  const headers = new Map<string, string>();
  const res = { statusCode: 0, setHeader: headers.set.bind(headers), end: vi.fn() };

  await handler({ method, url, headers: key ? { 'x-origin-key': key } : {}, body }, res);

  return { status: res.statusCode, headers, body: JSON.parse(res.end.mock.calls[0][0]) };
}

afterEach(() => vi.unstubAllEnvs());

describe('Zyla CSV Audit origin', () => {
  it('returns the synthetic audit through the rewritten services route', async () => {
    vi.stubEnv('ZYLA_CSV_ORIGIN_SECRET', secret);
    const result = await invoke('/api/v1/services?view=zyla-csv-audit', 'POST', secret);

    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toBe('no-store');
    expect(result.body.qualityPass).toBe(false);
    expect(result.body.results[0].emptyCells).toBe(1);
  });

  it('requires a configured secret and rejects unauthorized calls', async () => {
    vi.stubEnv('ZYLA_CSV_ORIGIN_SECRET', '');
    expect((await invoke('/api/zyla-csv-audit', 'POST')).status).toBe(503);

    vi.stubEnv('ZYLA_CSV_ORIGIN_SECRET', secret);
    expect((await invoke('/api/zyla-csv-audit', 'POST')).status).toBe(401);
    expect((await invoke('/api/zyla-csv-audit', 'POST', 'incorrect')).status).toBe(401);
  });

  it('only accepts POST and rejects invalid CSV requests', async () => {
    vi.stubEnv('ZYLA_CSV_ORIGIN_SECRET', secret);
    const method = await invoke('/api/zyla-csv-audit', 'GET');
    expect(method.status).toBe(405);
    expect(method.headers.get('Allow')).toBe('POST');
    expect((await invoke('/api/zyla-csv-audit', 'POST', secret, {})).status).toBe(400);
  });
});

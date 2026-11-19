#!/usr/bin/env node
// Public, read-only production smoke test. Never creates orders, keys, checkouts or payments.
const origin = (process.env.GXEON_SMOKE_ORIGIN || 'https://gxeon-wallet-command-center.vercel.app').replace(/\/$/, '');
const timeoutMs = Number(process.env.GXEON_SMOKE_TIMEOUT_MS || 15000);
const checks = [];

async function request(path) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(new URL(path, origin), {
      method: 'GET',
      redirect: 'follow',
      headers: { accept: 'application/json, text/html;q=0.9' },
      cache: 'no-store',
      signal: controller.signal,
    });
    const body = await response.text();
    return { status: response.status, type: response.headers.get('content-type') || '', body };
  } finally {
    clearTimeout(timeout);
  }
}

function requireValue(condition, message) {
  if (!condition) throw new Error(message);
}

async function check(label, fn) {
  try {
    await fn();
    checks.push({ label, ok: true });
    console.log(`PASS ${label}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    checks.push({ label, ok: false, message });
    console.error(`FAIL ${label}: ${message}`);
  }
}

async function json(path, status = 200) {
  const response = await request(path);
  requireValue(response.status === status, `${path}: HTTP ${response.status}, expected ${status}`);
  requireValue(response.type.includes('application/json'), `${path}: expected JSON`);
  try { return JSON.parse(response.body); }
  catch { throw new Error(`${path}: invalid JSON`); }
}

await check('Market storefront serves HTML', async () => {
  const response = await request('/market');
  requireValue(response.status === 200 && response.body.includes('<html'), 'Storefront HTML not available');
});
await check('Credits storefront serves HTML', async () => {
  const response = await request('/credits?pack=pack_2');
  requireValue(response.status === 200 && response.body.includes('<html'), 'Credits HTML not available');
});
await check('Four purchasable services are advertised', async () => {
  const body = await json('/v1/services');
  const ids = new Set(body.services?.filter(s => s.status === 'AVAILABLE').map(s => s.serviceId));
  for (const id of ['gxeon_json_validate_v1', 'gxeon_csv_audit_v1', 'gxeon_url_verify_v1', 'gxeon_api_health_v1']) {
    requireValue(ids.has(id), `Missing available service ${id}`);
  }
});
await check('PICO pack and BRL pricing agree', async () => {
  const body = await json('/v1/billing/topup');
  const pico = body.packs?.find(p => p.id === 'pack_2');
  requireValue(body.currency === 'BRL', 'Unexpected credit currency');
  requireValue(pico?.credits === 2 && pico.priceCents === 99, 'PICO price/credits mismatch');
});
await check('Unauthenticated MCP is discovery-only', async () => {
  const body = await json('/api/v1/mcp?view=public-market');
  requireValue(body.authentication === 'none', 'Public MCP discovery requires auth');
  requireValue(body.scope?.toLowerCase().includes('read-only'), 'Public MCP scope is not read-only');
  for (const name of ['gxeon_list_services', 'gxeon_list_credit_packs', 'gxeon_plan_purchase', 'gxeon_get_agent_buying_guide']) {
    requireValue(body.tools?.includes(name), `Missing MCP discovery tool ${name}`);
  }
});
await check('Payment-method information published', async () => {
  const body = await json('/v1/payment-methods');
  requireValue(body.paymentMethods?.some(method => method.rail === 'prepaid_credits' && method.currency === 'BRL'), 'Missing BRL prepaid rail');
});
await check('Private balance does not leak without authentication', async () => {
  const body = await json('/v1/balance', 401);
  requireValue(Boolean(body.error), 'Unauthorized balance response missing error');
});
await check('Private jobs do not leak without authentication', async () => {
  const body = await json('/v1/jobs?jobId=marketplace_smoke_probe', 401);
  requireValue(Boolean(body.error), 'Unauthorized jobs response missing error');
});
await check('x402 payment route is POST-only', async () => {
  const response = await request('/x402/json-validate');
  requireValue(response.status === 405, `Unexpected x402 GET response HTTP ${response.status}`);
});
const failed = checks.filter(check => !check.ok);
console.log(JSON.stringify({ checkedAt: new Date().toISOString(), origin, total: checks.length, passed: checks.length - failed.length, failed: failed.map(({label, message}) => ({label, message})), classification: 'PUBLIC_READ_ONLY_SMOKE_NOT_PAYMENT_PROOF' }));
if (failed.length) process.exitCode = 1;

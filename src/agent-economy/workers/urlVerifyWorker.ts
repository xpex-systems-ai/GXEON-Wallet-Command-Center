import { safeHttpRequest } from '../antiSsrf.js';

export interface UrlVerifyInput {
  urls: string[];
  checks?: {
    http?: boolean;
    dns?: boolean;
    tls?: boolean;
    redirects?: boolean;
    latency?: boolean;
    headers?: boolean;
  };
  expected?: {
    statusCodes?: number[];
  };
}

export interface UrlCheckResult {
  url: string;
  finalUrl: string;
  reachable: boolean;
  statusCode: number;
  dns: { resolved: boolean };
  tls: { valid: boolean };
  redirectCount: number;
  latencyMs: number;
  headers: Record<string, string>;
  expectedMatched: boolean;
  error?: string;
}

export interface UrlVerifyWorkerOutput {
  results: UrlCheckResult[];
  summary: {
    total: number;
    healthy: number;
    failed: number;
  };
}

export async function executeUrlVerifyWorker(
  input: UrlVerifyInput
): Promise<UrlVerifyWorkerOutput> {
  const urls = input.urls || [];
  const expectedCodes = input.expected?.statusCodes || [200];
  const results: UrlCheckResult[] = [];

  let healthyCount = 0;
  let failedCount = 0;

  for (const targetUrl of urls) {
    try {
      const resp = await safeHttpRequest(targetUrl, {
        maxRedirects: 5,
        timeoutMs: 10000,
        maxBytes: 1_048_576,
      });

      const expectedMatched = expectedCodes.includes(resp.statusCode);
      const isHealthy = resp.statusCode >= 200 && resp.statusCode < 400 && expectedMatched;

      if (isHealthy) healthyCount++;
      else failedCount++;

      results.push({
        url: targetUrl,
        finalUrl: resp.finalUrl,
        reachable: true,
        statusCode: resp.statusCode,
        dns: { resolved: resp.dnsResolved },
        tls: { valid: resp.tlsValid },
        redirectCount: resp.redirectCount,
        latencyMs: resp.latencyMs,
        headers: resp.headers,
        expectedMatched,
      });
    } catch (err: unknown) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        url: targetUrl,
        finalUrl: targetUrl,
        reachable: false,
        statusCode: 0,
        dns: { resolved: false },
        tls: { valid: false },
        redirectCount: 0,
        latencyMs: 0,
        headers: {},
        expectedMatched: false,
        error: msg,
      });
    }
  }

  return {
    results,
    summary: {
      total: urls.length,
      healthy: healthyCount,
      failed: failedCount,
    },
  };
}

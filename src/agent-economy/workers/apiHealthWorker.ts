import { safeHttpRequest } from '../antiSsrf.js';

export interface EndpointCheckConfig {
  url: string;
  method?: 'GET' | 'HEAD';
  expectedStatus?: number;
  requiredFields?: string[];
}

export interface ApiHealthInput {
  endpoints: EndpointCheckConfig[];
}

export interface EndpointHealthResult {
  url: string;
  status: number;
  latencyMs: number;
  healthy: boolean;
  fieldAssertions: {
    passed: boolean;
    missingFields: string[];
  };
  error?: string;
}

export interface ApiHealthWorkerOutput {
  results: EndpointHealthResult[];
  summary: {
    total: number;
    healthy: number;
    failed: number;
  };
}

export async function executeApiHealthWorker(
  input: ApiHealthInput
): Promise<ApiHealthWorkerOutput> {
  const endpoints = input.endpoints || [];
  const results: EndpointHealthResult[] = [];
  let healthyCount = 0;
  let failedCount = 0;

  for (const ep of endpoints) {
    const expectedStatus = ep.expectedStatus || 200;
    try {
      const resp = await safeHttpRequest(ep.url, {
        maxRedirects: 5,
        timeoutMs: 10000,
        headers: { Accept: 'application/json, */*' },
      });

      const missingFields: string[] = [];
      let jsonParsed: Record<string, unknown> | null = null;

      if (resp.bodySnippet) {
        try {
          jsonParsed = JSON.parse(resp.bodySnippet);
        } catch {
          // not json
        }
      }

      if (ep.requiredFields && ep.requiredFields.length > 0) {
        if (!jsonParsed || typeof jsonParsed !== 'object') {
          missingFields.push(...ep.requiredFields);
        } else {
          for (const reqField of ep.requiredFields) {
            if (!(reqField in jsonParsed)) {
              missingFields.push(reqField);
            }
          }
        }
      }

      const statusMatched = resp.statusCode === expectedStatus;
      const isHealthy = statusMatched && missingFields.length === 0;

      if (isHealthy) healthyCount++;
      else failedCount++;

      results.push({
        url: ep.url,
        status: resp.statusCode,
        latencyMs: resp.latencyMs,
        healthy: isHealthy,
        fieldAssertions: {
          passed: missingFields.length === 0,
          missingFields,
        },
      });
    } catch (err: unknown) {
      failedCount++;
      const msg = err instanceof Error ? err.message : String(err);
      results.push({
        url: ep.url,
        status: 0,
        latencyMs: 0,
        healthy: false,
        fieldAssertions: {
          passed: false,
          missingFields: ep.requiredFields || [],
        },
        error: msg,
      });
    }
  }

  return {
    results,
    summary: {
      total: endpoints.length,
      healthy: healthyCount,
      failed: failedCount,
    },
  };
}

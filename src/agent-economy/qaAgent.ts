import { Job, ServiceDefinition } from './types.js';
import { isIpBlocked } from './antiSsrf.js';
import net from 'node:net';

export interface QaValidationResult {
  passed: boolean;
  errors: string[];
  qaReport: {
    inputCount: number;
    outputCount: number;
    durationMs: number;
    securityCheckPassed: boolean;
  };
}

export function validateExecutionWithQaAgent(
  job: Job,
  service: ServiceDefinition,
  rawOutput: unknown,
  durationMs: number
): QaValidationResult {
  const errors: string[] = [];

  if (!rawOutput || typeof rawOutput !== 'object') {
    return {
      passed: false,
      errors: ['Execution produced null or non-object output'],
      qaReport: {
        inputCount: 0,
        outputCount: 0,
        durationMs,
        securityCheckPassed: false,
      },
    };
  }

  const out = rawOutput as Record<string, unknown>;

  // Check duration limit
  if (durationMs > service.timeoutMs + 2000) {
    errors.push(
      `Execution duration (${durationMs}ms) exceeded maximum service timeout (${service.timeoutMs}ms)`
    );
  }

  let inputCount = 0;
  let outputCount = 0;
  let securityCheckPassed = true;

  if (service.serviceId === 'gxeon_url_verify_v1') {
    const urls = (job.input?.urls as string[]) || [];
    const results = (out.results as Array<{ url: string; finalUrl?: string; error?: string }>) || [];

    inputCount = urls.length;
    outputCount = results.length;

    if (inputCount !== outputCount) {
      errors.push(`Input count (${inputCount}) does not match output count (${outputCount})`);
    }

    // Verify all URLs accounted for
    const outputUrlSet = new Set(results.map((r) => r.url));
    for (const u of urls) {
      if (!outputUrlSet.has(u)) {
        errors.push(`Missing verification result for URL: ${u}`);
      }
    }

    // Verify no private or loopback IP leaked into final URL or error
    for (const r of results) {
      if (r.finalUrl) {
        try {
          const parsed = new URL(r.finalUrl);
          const host = parsed.hostname.toLowerCase();
          if (host === 'localhost' || host.includes('metadata') || host.endsWith('.internal') || host.endsWith('.local')) {
            securityCheckPassed = false;
            errors.push(`QA Security Alert: Contacted prohibited host: ${host}`);
          } else if (net.isIP(host)) {
            const ipCheck = isIpBlocked(host);
            if (ipCheck.blocked) {
              securityCheckPassed = false;
              errors.push(`QA Security Alert: Contacted prohibited address: ${host}`);
            }
          }
        } catch {
          // not a valid URL
        }
      }
    }
  } else if (service.serviceId === 'gxeon_json_validate_v1') {
    inputCount = 1;
    outputCount = 1;
    if (typeof out.valid !== 'boolean' || !Array.isArray(out.errors)) {
      errors.push('JSON validate output missing required boolean valid or errors array');
    }
  } else if (service.serviceId === 'gxeon_api_health_v1') {
    const endpoints = (job.input?.endpoints as unknown[]) || [];
    const results = (out.results as unknown[]) || [];
    inputCount = endpoints.length;
    outputCount = results.length;

    if (inputCount !== outputCount) {
      errors.push(`Endpoints input count (${inputCount}) does not match results (${outputCount})`);
    }
  }

  return {
    passed: errors.length === 0 && securityCheckPassed,
    errors,
    qaReport: {
      inputCount,
      outputCount,
      durationMs,
      securityCheckPassed,
    },
  };
}

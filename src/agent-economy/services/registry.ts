import { ServiceDefinition } from '../types.js';

/**
 * GXEON Service Registry
 * Authoritative capability catalog for external and internal agents.
 */

export const SERVICE_REGISTRY: Record<string, ServiceDefinition> = {
  gxeon_json_validate_v1: {
    serviceId: 'gxeon_json_validate_v1',
    version: '1.0.0',
    name: 'GXEON JSON Validate',
    description:
      'High-performance JSON syntax validation and schema conformance verification with zero outbound network footprint.',
    inputSchema: {
      type: 'object',
      properties: {
        payload: {
          description: 'JSON string or parsed object to validate',
        },
        schema: {
          type: 'object',
          description: 'Optional JSON Schema for structure assertion',
        },
      },
      required: ['payload'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        errors: { type: 'array', items: { type: 'string' } },
        details: { type: 'object' },
      },
      required: ['valid', 'errors'],
    },
    unit: 'payload',
    unitPriceCredits: 2,
    minimumChargeCredits: 2,
    maxBatch: 50,
    timeoutMs: 5000,
    executionPolicy: 'ZERO_NETWORK_SANDBOX',
    riskClass: 'LOW',
    status: 'AVAILABLE',
  },

  gxeon_csv_audit_v1: {
    serviceId: 'gxeon_csv_audit_v1',
    version: '1.0.0',
    name: 'GXEON CSV Audit',
    description:
      'Zero-network CSV quality audit for uneven rows, duplicate headers or records, blank rows, and empty cells.',
    inputSchema: {
      type: 'object',
      properties: {
        csv: { type: 'string', description: 'CSV text, up to 512,000 characters' },
        delimiter: { type: 'string', enum: [',', ';', '\t', '|'] },
        hasHeader: { type: 'boolean' },
      },
      required: ['csv'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        qualityPass: { type: 'boolean' },
        summary: { type: 'object' },
        results: { type: 'array' },
      },
      required: ['qualityPass', 'summary', 'results'],
    },
    unit: 'file',
    unitPriceCredits: 2,
    minimumChargeCredits: 2,
    maxBatch: 1,
    timeoutMs: 5000,
    executionPolicy: 'ZERO_NETWORK_SANDBOX',
    riskClass: 'LOW',
    status: 'AVAILABLE',
  },

  gxeon_url_verify_v1: {
    serviceId: 'gxeon_url_verify_v1',
    version: '1.0.0',
    name: 'GXEON URL Verify',
    description:
      'Batch public URL verification with strict anti-SSRF defense, DNS resolution, TLS inspection, and redirect analysis.',
    inputSchema: {
      type: 'object',
      properties: {
        urls: {
          type: 'array',
          items: { type: 'string', format: 'uri' },
          minItems: 1,
          maxItems: 500,
        },
        checks: {
          type: 'object',
          properties: {
            http: { type: 'boolean' },
            dns: { type: 'boolean' },
            tls: { type: 'boolean' },
            redirects: { type: 'boolean' },
            latency: { type: 'boolean' },
            headers: { type: 'boolean' },
          },
        },
        expected: {
          type: 'object',
          properties: {
            statusCodes: {
              type: 'array',
              items: { type: 'integer' },
            },
          },
        },
      },
      required: ['urls'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string' },
              finalUrl: { type: 'string' },
              reachable: { type: 'boolean' },
              statusCode: { type: 'integer' },
              dns: { type: 'object' },
              tls: { type: 'object' },
              redirectCount: { type: 'integer' },
              latencyMs: { type: 'integer' },
              headers: { type: 'object' },
              expectedMatched: { type: 'boolean' },
            },
          },
        },
        summary: {
          type: 'object',
          properties: {
            total: { type: 'integer' },
            healthy: { type: 'integer' },
            failed: { type: 'integer' },
          },
        },
      },
    },
    unit: 'url',
    unitPriceCredits: 5,
    minimumChargeCredits: 5,
    maxBatch: 500,
    timeoutMs: 30000,
    executionPolicy: 'STRICT_ANTI_SSRF_OUTBOUND',
    riskClass: 'MEDIUM',
    status: 'AVAILABLE',
  },

  gxeon_api_health_v1: {
    serviceId: 'gxeon_api_health_v1',
    version: '1.0.0',
    name: 'GXEON API Health',
    description:
      'HTTP availability, latency, header inspection, and payload assertion for public REST endpoints.',
    inputSchema: {
      type: 'object',
      properties: {
        endpoints: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              url: { type: 'string', format: 'uri' },
              method: { type: 'string', enum: ['GET', 'HEAD'] },
              expectedStatus: { type: 'integer' },
              requiredFields: { type: 'array', items: { type: 'string' } },
            },
            required: ['url'],
          },
          maxItems: 20,
        },
      },
      required: ['endpoints'],
    },
    outputSchema: {
      type: 'object',
      properties: {
        results: { type: 'array' },
        summary: { type: 'object' },
      },
    },
    unit: 'endpoint',
    unitPriceCredits: 10,
    minimumChargeCredits: 10,
    maxBatch: 20,
    timeoutMs: 15000,
    executionPolicy: 'STRICT_ANTI_SSRF_OUTBOUND',
    riskClass: 'MEDIUM',
    status: 'AVAILABLE',
  },
};

export function getService(serviceId: string): ServiceDefinition | null {
  return SERVICE_REGISTRY[serviceId] || null;
}

export function listAvailableServices(): ServiceDefinition[] {
  return Object.values(SERVICE_REGISTRY).filter((s) => s.status === 'AVAILABLE');
}

export function listAllServices(): ServiceDefinition[] {
  return Object.values(SERVICE_REGISTRY);
}

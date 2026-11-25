import { getService } from '../services/registry.js';
import { X402_PREMIUM_SERVICES } from './premiumServices.js';

const examples: Record<string, { tags: string[]; input: Record<string, unknown>; result: Record<string, unknown> }> = {
  gxeon_json_validate_v1: {
    tags: ['json', 'json-schema', 'validation'],
    input: {
      payload: { ready: true },
      schema: { type: 'object', required: ['ready'], properties: { ready: { type: 'boolean' } } },
    },
    result: { valid: true, errors: [], details: { parsedType: 'object', byteLength: 14, keyCount: 1 } },
  },
  gxeon_csv_audit_v1: {
    tags: ['csv', 'csv-preflight', 'data-quality'],
    input: { csv: 'id,name\n1,Ana\n2,', hasHeader: true },
    result: {
      qualityPass: false,
      summary: { total: 1, healthy: 0, failed: 1 },
      results: [{
        rowCount: 3, dataRowCount: 2, columnCount: 2, headers: ['id', 'name'], delimiter: ',', hasHeader: true,
        unevenRows: [], duplicateHeaders: [], duplicateRows: [], blankRows: [], emptyCells: 1,
      }],
    },
  },
};

export function describeX402Service(serviceId: string, url: string) {
  const premium = Object.prototype.hasOwnProperty.call(X402_PREMIUM_SERVICES, serviceId) ? X402_PREMIUM_SERVICES[serviceId] : undefined;
  const service = premium ?? getService(serviceId);
  const example = premium
    ? { tags: premium.tags, input: premium.example, result: premium.execute(premium.example) }
    : examples[serviceId];
  if (!service || !example) return null;

  return {
    resource: {
      url,
      serviceName: service.name,
      description: service.description,
      mimeType: 'application/json',
      tags: example.tags,
    },
    extensions: {
      bazaar: {
        info: {
          input: { type: 'http', method: 'POST', bodyType: 'json', body: example.input },
          output: { type: 'json', example: { status: 'SUCCESS', serviceId, result: example.result } },
        },
        schema: {
          $schema: 'https://json-schema.org/draft/2020-12/schema',
          type: 'object',
          required: ['input'],
          properties: {
            input: {
              type: 'object',
              required: ['type', 'method', 'bodyType', 'body'],
              additionalProperties: false,
              properties: {
                type: { type: 'string', const: 'http' },
                method: { type: 'string', const: 'POST' },
                bodyType: { type: 'string', const: 'json' },
                body: service.inputSchema,
              },
            },
            output: {
              type: 'object',
              required: ['type', 'example'],
              properties: {
                type: { type: 'string', const: 'json' },
                example: {
                  type: 'object',
                  required: ['status', 'serviceId', 'result'],
                  properties: {
                    status: { const: 'SUCCESS' },
                    serviceId: { const: serviceId },
                    result: service.outputSchema,
                    receipt: { type: 'object' },
                  },
                },
              },
            },
          },
        },
      },
    },
  };
}

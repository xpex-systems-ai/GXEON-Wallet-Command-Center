import { executeImportCheckWorker } from '../workers/importCheckWorker.js';
import { executeJsonContractBatchWorker } from '../workers/jsonContractBatchWorker.js';

export const CSV_IMPORT_CHECK = 'gxeon_csv_import_check_v1';
export const JSON_CONTRACT_BATCH = 'gxeon_json_contract_batch_v1';

const importExample = {
  files: ['lead_id,email\n001,ana@example.com\n', 'lead_id,email\n001,ana@example.com\n002,\n'],
  requiredColumns: ['email'],
  identityColumn: 'lead_id',
};
const contractExample = {
  payloads: [{ id: '101', quantity: 1 }, { id: '102', quantity: '2' }],
  contract: { id: 'string', quantity: 'number' },
};

export const X402_PREMIUM_SERVICES: Readonly<Record<string, {
  serviceId: string;
  name: string;
  description: string;
  unit: string;
  tags: string[];
  inputSchema: Record<string, unknown>;
  outputSchema: Record<string, unknown>;
  example: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => { qualityPass: boolean } | { valid: boolean };
}>> = {
  [CSV_IMPORT_CHECK]: {
    serviceId: CSV_IMPORT_CHECK,
    name: 'GXEON CSV Import Check',
    description: 'Preflight a batch of lead imports against required CRM columns and detect duplicate lead identifiers across files.',
    unit: 'batch',
    tags: ['csv', 'crm', 'lead-import', 'data-quality'],
    inputSchema: {
      type: 'object',
      properties: {
        files: { type: 'array', minItems: 1, maxItems: 10, items: { type: 'string', minLength: 1, maxLength: 512000 }, description: 'CSV files with headers. At most 512,000 characters in total.' },
        requiredColumns: { type: 'array', minItems: 1, maxItems: 50, items: { type: 'string', minLength: 1, maxLength: 128 } },
        identityColumn: { type: 'string', minLength: 1, maxLength: 128 },
        delimiter: { type: 'string', enum: [',', ';', '\t', '|'] },
      },
      required: ['files', 'requiredColumns', 'identityColumn'],
    },
    outputSchema: {
      type: 'object',
      properties: { qualityPass: { type: 'boolean' }, decision: { enum: ['ALLOW', 'BLOCK'] }, files: { type: 'array' } },
      required: ['qualityPass', 'decision', 'files'],
    },
    example: importExample,
    execute: executeImportCheckWorker,
  },
  [JSON_CONTRACT_BATCH]: {
    serviceId: JSON_CONTRACT_BATCH,
    name: 'GXEON JSON Contract Batch',
    description: 'Validate up to 100 JSON objects against one required-field and type contract, with per-item findings.',
    unit: 'batch',
    tags: ['json', 'validation', 'batch', 'contract'],
    inputSchema: {
      type: 'object',
      properties: {
        payloads: { type: 'array', minItems: 1, maxItems: 100, items: {} },
        contract: {
          type: 'object', minProperties: 1, maxProperties: 50, propertyNames: { minLength: 1, maxLength: 128 },
          additionalProperties: { enum: ['string', 'number', 'boolean', 'object', 'array', 'null'] },
        },
      },
      required: ['payloads', 'contract'],
    },
    outputSchema: {
      type: 'object',
      properties: { valid: { type: 'boolean' }, results: { type: 'array' } },
      required: ['valid', 'results'],
    },
    example: contractExample,
    execute: executeJsonContractBatchWorker,
  },
};

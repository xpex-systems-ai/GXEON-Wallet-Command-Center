import { executeJsonValidateWorker } from './jsonValidateWorker.js';

const TYPES = new Set(['string', 'number', 'boolean', 'object', 'array', 'null']);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

export function executeJsonContractBatchWorker(input: Record<string, unknown>) {
  const { payloads, contract } = input;
  if (!Array.isArray(payloads) || payloads.length < 1 || payloads.length > 100) {
    throw new Error('Provide 1–100 JSON payloads.');
  }
  if (!isRecord(contract)) throw new Error('Provide a contract mapping required field names to JSON types.');
  const fields = Object.entries(contract);
  if (fields.length < 1 || fields.length > 50
    || fields.some(([key, type]) => !key.trim() || key.length > 128 || typeof type !== 'string' || !TYPES.has(type))) {
    throw new Error('Provide 1–50 required fields with supported JSON types.');
  }
  const results = payloads.map((payload, index) => {
    let value: unknown = payload;
    if (typeof payload === 'string') {
      try { value = JSON.parse(payload); } catch { return { index, errors: ['INVALID_JSON'] }; }
    }
    if (!isRecord(value)) return { index, errors: ['EXPECTED_OBJECT'] };
    const missing = fields.filter(([key]) => !Object.prototype.hasOwnProperty.call(value, key)).map(([key]) => key);
    const present = fields.filter(([key]) => Object.prototype.hasOwnProperty.call(value, key));
    const checked = executeJsonValidateWorker({ payload: value, schema: {
      type: 'object',
      properties: Object.fromEntries(present.map(([key, type]) => [key, { type: type as string }])),
    } });
    return { index, errors: [...missing.map(key => 'MISSING_FIELD: ' + key), ...checked.errors] };
  });
  return { valid: results.every(result => !result.errors.length), results };
}

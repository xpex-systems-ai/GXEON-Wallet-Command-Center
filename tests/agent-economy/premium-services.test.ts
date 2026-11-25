import { describe, expect, it } from 'vitest';
import { executeImportCheckWorker } from '../../src/agent-economy/workers/importCheckWorker.js';
import { executeJsonContractBatchWorker } from '../../src/agent-economy/workers/jsonContractBatchWorker.js';

describe('CSV import check', () => {
  it('blocks duplicate lead IDs across files and reports missing values without echoing lead data', () => {
    const result = executeImportCheckWorker({
      files: ['ID,email\nA,one@example.com\n', 'id,email\na,two@example.com\nb,\n'],
      requiredColumns: ['email'],
      identityColumn: 'id',
    });
    expect(result.decision).toBe('BLOCK');
    expect(result.files[1]).toMatchObject({
      missingValueRecords: 1,
      missingValues: [{ record: 3, columns: ['email'] }],
      duplicateIdentityRecords: 1,
      duplicateIdentities: [{ record: 2, first: { file: 1, record: 2 } }],
    });
    expect(JSON.stringify(result)).not.toContain('@example.com');
  });

  it('allows a clean import with quoted multiline data', () => {
    expect(executeImportCheckWorker({
      files: ['id,note\n1,"first\nsecond"\n'],
      requiredColumns: ['note'],
      identityColumn: 'id',
    }).decision).toBe('ALLOW');
  });

  it('blocks missing columns and header-only files', () => {
    const result = executeImportCheckWorker({ files: ['id\n'], requiredColumns: ['email'], identityColumn: 'id' });
    expect(result).toMatchObject({ decision: 'BLOCK', files: [{ dataRecords: 0, missingColumns: ['email'] }] });
  });
});

describe('JSON contract batch', () => {
  it('attributes JSON syntax, ownership and type findings to the right item', () => {
    const result = executeJsonContractBatchWorker({
      payloads: [{ id: '1' }, '{"id":2}', 'secret malformed input', {}, []],
      contract: { id: 'string' },
    });
    expect(result.valid).toBe(false);
    expect(result.results).toMatchObject([
      { index: 0, errors: [] },
      { index: 1, errors: [expect.stringContaining('type mismatch')] },
      { index: 2, errors: ['INVALID_JSON'] },
      { index: 3, errors: ['MISSING_FIELD: id'] },
      { index: 4, errors: ['EXPECTED_OBJECT'] },
    ]);
  });
});

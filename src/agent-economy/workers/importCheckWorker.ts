import { executeCsvAuditWorker, parseCsv, type CsvAuditInput } from './csvAuditWorker.js';

const MAX_FILES = 10;
const MAX_CHARS = 512_000;
const MAX_FINDINGS_PER_FILE = 100;

export function executeImportCheckWorker(input: Record<string, unknown>) {
  const { files, requiredColumns, identityColumn, delimiter = ',' } = input;
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES
    || files.some(file => typeof file !== 'string' || file.length === 0)
    || files.reduce((size, file) => size + file.length, 0) > MAX_CHARS) {
    throw new Error('Provide 1–10 non-empty CSV files with at most 512,000 total characters.');
  }
  if (!Array.isArray(requiredColumns) || requiredColumns.length < 1 || requiredColumns.length > 50
    || requiredColumns.some(name => typeof name !== 'string' || !name.trim() || name.length > 128)) {
    throw new Error('Provide 1–50 non-empty required column names of at most 128 characters.');
  }
  if (typeof identityColumn !== 'string' || !identityColumn.trim() || identityColumn.length > 128) {
    throw new Error('Provide a non-empty identityColumn of at most 128 characters.');
  }
  if (typeof delimiter !== 'string' || ![',', ';', '\t', '|'].includes(delimiter)) {
    throw new Error('Unsupported delimiter.');
  }

  const normalize = (value: string) => value.trim().toLowerCase();
  const required = [...new Set([...requiredColumns, identityColumn].map(normalize))];
  const firstByIdentity = new Map<string, { file: number; record: number }>();
  const reports = files.map((csv: string, index) => {
    const file = index + 1;
    const audit = executeCsvAuditWorker({ csv, delimiter: delimiter as CsvAuditInput['delimiter'], hasHeader: true }).results[0];
    const headers = audit.headers.map(normalize);
    const columns = required.map(name => ({ name, index: headers.indexOf(name) }));
    const missingColumns = columns.filter(column => column.index < 0).map(column => column.name);
    const identityIndex = headers.indexOf(normalize(identityColumn));
    const missingValues: Array<{ record: number; columns: string[] }> = [];
    const duplicateIdentities: Array<{ record: number; first: { file: number; record: number } }> = [];

    let missingValueRecords = 0;
    let duplicateIdentityRecords = 0;
    parseCsv(csv, delimiter).slice(1).forEach((row, index) => {
      if (row.every(value => value.trim() === '')) return;
      const record = index + 2;
      const missing = columns.filter(column => column.index >= 0 && !row[column.index]?.trim()).map(column => column.name);
      if (missing.length) {
        missingValueRecords++;
        if (missingValues.length < MAX_FINDINGS_PER_FILE) missingValues.push({ record, columns: missing });
      }
      const identity = normalize(row[identityIndex] ?? '');
      if (!identity) return;
      const first = firstByIdentity.get(identity);
      if (first) {
        duplicateIdentityRecords++;
        if (duplicateIdentities.length < MAX_FINDINGS_PER_FILE) duplicateIdentities.push({ record, first });
      } else {
        firstByIdentity.set(identity, { file, record });
      }
    });

    return {
      file, dataRecords: audit.dataRowCount, missingColumns, missingValues, missingValueRecords, duplicateIdentities, duplicateIdentityRecords,
      duplicateHeaders: audit.duplicateHeaders.length,
      unevenRecords: audit.unevenRows.map(issue => issue.line),
      blankRecords: audit.blankRows,
    };
  });
  const qualityPass = reports.every(report => report.dataRecords > 0 && !report.missingColumns.length
    && !report.missingValues.length && !report.duplicateIdentities.length && !report.duplicateHeaders
    && !report.unevenRecords.length && !report.blankRecords.length);
  return { qualityPass, decision: qualityPass ? 'ALLOW' : 'BLOCK', files: reports };
}

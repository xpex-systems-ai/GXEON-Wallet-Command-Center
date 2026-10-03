export interface CsvAuditInput {
  csv: string;
  delimiter?: ',' | ';' | '\t' | '|';
  hasHeader?: boolean;
}

export interface CsvAuditResult {
  qualityPass: boolean;
  summary: { total: number; healthy: number; failed: number };
  results: Array<{
    rowCount: number;
    dataRowCount: number;
    columnCount: number;
    headers: string[];
    delimiter: string;
    hasHeader: boolean;
    unevenRows: Array<{ line: number; columns: number; expected: number }>;
    duplicateHeaders: string[];
    duplicateRows: Array<{ line: number; firstLine: number }>;
    blankRows: number[];
    emptyCells: number;
  }>;
}

const MAX_CSV_CHARS = 512_000;
const MAX_ROWS = 10_000;
const MAX_COLUMNS = 500;

function parseCsv(csv: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < csv.length; i++) {
    const ch = csv[i];

    if (ch === '"') {
      if (inQuotes && csv[i + 1] === '"') {
        cell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && ch === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
      if (ch === '\r' && csv[i + 1] === '\n') i++;
      if (rows.length > MAX_ROWS) {
        throw new Error(`CSV exceeds maximum of ${MAX_ROWS} rows`);
      }
      continue;
    }

    cell += ch;
  }

  if (inQuotes) {
    throw new Error('CSV contains an unterminated quoted field');
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function duplicateHeaderNames(headers: string[]): string[] {
  const seen = new Map<string, string>();
  const duplicates = new Set<string>();

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();
    if (!normalized) continue;
    if (seen.has(normalized)) duplicates.add(header.trim());
    else seen.set(normalized, header.trim());
  }

  return Array.from(duplicates);
}

export function executeCsvAuditWorker(input: CsvAuditInput): CsvAuditResult {
  if (!input || typeof input.csv !== 'string') {
    throw new Error('csv must be provided as a string');
  }
  if (input.csv.length === 0) {
    throw new Error('csv cannot be empty');
  }
  if (input.csv.length > MAX_CSV_CHARS) {
    throw new Error(`CSV exceeds maximum size of ${MAX_CSV_CHARS} characters`);
  }

  const delimiter = input.delimiter ?? ',';
  if (![',', ';', '\t', '|'].includes(delimiter)) {
    throw new Error('Unsupported delimiter');
  }

  const hasHeader = input.hasHeader !== false;
  const rows = parseCsv(input.csv, delimiter);
  if (rows.length === 0) throw new Error('CSV contains no rows');

  const firstNonBlank = rows.find((candidate) => candidate.some((value) => value.trim() !== ''));
  if (!firstNonBlank) throw new Error('CSV contains no data');

  const columnCount = firstNonBlank.length;
  if (columnCount > MAX_COLUMNS) {
    throw new Error(`CSV exceeds maximum of ${MAX_COLUMNS} columns`);
  }

  const headers = hasHeader
    ? rows[0].map((value) => value.trim())
    : Array.from({ length: columnCount }, (_, index) => `column_${index + 1}`);

  const blankRows: number[] = [];
  const unevenRows: Array<{ line: number; columns: number; expected: number }> = [];
  let emptyCells = 0;
  const duplicateRows: Array<{ line: number; firstLine: number }> = [];
  const firstRowByValue = new Map<string, number>();
  const dataStart = hasHeader ? 1 : 0;

  for (let index = 0; index < rows.length; index++) {
    const current = rows[index];
    const line = index + 1;
    const isBlank = current.every((value) => value.trim() === '');

    if (isBlank) {
      blankRows.push(line);
      continue;
    }

    if (current.length !== columnCount) {
      unevenRows.push({ line, columns: current.length, expected: columnCount });
    }

    if (index >= dataStart) {
      emptyCells += current.filter((value) => value.trim() === '').length;
      const key = JSON.stringify(current);
      const firstLine = firstRowByValue.get(key);
      if (firstLine) duplicateRows.push({ line, firstLine });
      else firstRowByValue.set(key, line);
    }
  }

  const duplicateHeaders = hasHeader ? duplicateHeaderNames(headers) : [];
  const issueCount =
    unevenRows.length + duplicateHeaders.length + duplicateRows.length + blankRows.length + emptyCells;
  const qualityPass = issueCount === 0;

  return {
    qualityPass,
    summary: { total: 1, healthy: qualityPass ? 1 : 0, failed: qualityPass ? 0 : 1 },
    results: [{
      rowCount: rows.length,
      dataRowCount: Math.max(0, rows.length - dataStart),
      columnCount,
      headers,
      delimiter,
      hasHeader,
      unevenRows,
      duplicateHeaders,
      duplicateRows,
      blankRows,
      emptyCells,
    }],
  };
}

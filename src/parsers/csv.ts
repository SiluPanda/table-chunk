import { Table, TableMetadata } from '../types';

/**
 * Detect the delimiter used in CSV/TSV content.
 * Looks at the first 10 lines and picks the delimiter with the most
 * consistent occurrence count (lowest variance).
 */
export function detectDelimiter(input: string): string {
  const lines = input.split('\n').filter(l => l.trim().length > 0).slice(0, 10);
  if (lines.length === 0) return ',';

  const candidates = [',', '\t', ';', '|'];
  let bestDelimiter = ',';
  let bestVariance = Infinity;

  for (const delim of candidates) {
    const counts = lines.map(line => countDelimiterInLine(line, delim));
    if (counts.every(c => c === 0)) continue;

    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const variance = counts.reduce((sum, c) => sum + (c - mean) ** 2, 0) / counts.length;

    // Prefer delimiters with lower variance (more consistent) and higher mean count
    if (variance < bestVariance || (variance === bestVariance && mean > 0)) {
      bestVariance = variance;
      bestDelimiter = delim;
    }
  }

  return bestDelimiter;
}

/**
 * Count occurrences of a delimiter in a line, respecting quoted fields.
 */
function countDelimiterInLine(line: string, delimiter: string): number {
  let count = 0;
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        i++; // Skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (line[i] === delimiter && !inQuotes) {
      count++;
    }
  }

  return count;
}

/**
 * Parse CSV/TSV content into records (array of string arrays).
 * Handles RFC 4180 quoting: doubled quotes inside quoted fields.
 */
export function parseCSVRecords(input: string, delimiter: string): string[][] {
  const records: string[][] = [];
  let currentRecord: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const ch = input[i];

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < input.length && input[i + 1] === '"') {
          // Escaped quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // End of quoted field
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += ch;
        i++;
      }
    } else {
      if (ch === '"' && currentField.length === 0) {
        // Start of quoted field
        inQuotes = true;
        i++;
      } else if (ch === delimiter) {
        currentRecord.push(currentField.trim());
        currentField = '';
        i++;
      } else if (ch === '\r' && i + 1 < input.length && input[i + 1] === '\n') {
        // CRLF line ending
        currentRecord.push(currentField.trim());
        if (currentRecord.some(f => f.length > 0) || currentRecord.length > 1) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i += 2;
      } else if (ch === '\n') {
        currentRecord.push(currentField.trim());
        if (currentRecord.some(f => f.length > 0) || currentRecord.length > 1) {
          records.push(currentRecord);
        }
        currentRecord = [];
        currentField = '';
        i++;
      } else {
        currentField += ch;
        i++;
      }
    }
  }

  // Flush remaining
  if (currentField.length > 0 || currentRecord.length > 0) {
    currentRecord.push(currentField.trim());
    if (currentRecord.some(f => f.length > 0) || currentRecord.length > 1) {
      records.push(currentRecord);
    }
  }

  return records;
}

/**
 * Detect whether the first row is a header row.
 * Returns true if all values in the first row are non-numeric strings.
 */
function isHeaderRow(row: string[]): boolean {
  if (row.length === 0) return false;
  return row.every(cell => {
    const trimmed = cell.trim();
    if (trimmed.length === 0) return false;
    // If the value looks numeric, it's probably not a header
    return isNaN(Number(trimmed));
  });
}

/**
 * Parse CSV or TSV content into a Table object.
 */
export function parseCsvTable(
  input: string,
  options: {
    delimiter?: string;
    hasHeader?: boolean | 'auto';
    format?: 'csv' | 'tsv';
  } = {}
): Table {
  const delimiter = options.delimiter ?? (options.format === 'tsv' ? '\t' : detectDelimiter(input));
  const detectedFormat: 'csv' | 'tsv' = delimiter === '\t' ? 'tsv' : (options.format ?? 'csv');

  const records = parseCSVRecords(input, delimiter);

  if (records.length === 0) {
    return {
      headers: ['Column 1'],
      rows: [],
      metadata: {
        format: detectedFormat,
        rowCount: 0,
        columnCount: 1,
        inferredHeaders: true,
      },
    };
  }

  // Determine column count from the widest row
  const maxCols = Math.max(...records.map(r => r.length));

  // Determine if first row is header
  let useHeader: boolean;
  if (options.hasHeader === true) {
    useHeader = true;
  } else if (options.hasHeader === false) {
    useHeader = false;
  } else {
    useHeader = isHeaderRow(records[0]);
  }

  let headers: string[];
  let dataRows: string[][];
  let inferredHeaders = false;

  if (useHeader) {
    headers = records[0];
    dataRows = records.slice(1);
  } else {
    headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
    dataRows = records;
    inferredHeaders = true;
  }

  // Normalize all rows to have the same column count
  const columnCount = headers.length;
  const normalizedRows = dataRows.map(row => {
    const normalized = new Array(columnCount).fill('');
    for (let i = 0; i < Math.min(row.length, columnCount); i++) {
      normalized[i] = row[i];
    }
    return normalized;
  });

  const metadata: TableMetadata = {
    format: detectedFormat,
    rowCount: normalizedRows.length,
    columnCount,
    inferredHeaders,
  };

  return { headers, rows: normalizedRows, metadata };
}

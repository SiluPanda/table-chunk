import { SerializeRowOptions } from './types';

/**
 * Serialize a single data row and its headers into an embedding-friendly string.
 */
export function serializeRow(
  row: string[],
  headers: string[],
  options?: SerializeRowOptions
): string {
  const format = options?.format ?? 'key-value';
  const includeEmptyCells = options?.includeEmptyCells ?? false;

  switch (format) {
    case 'key-value':
      return serializeKeyValue(row, headers, includeEmptyCells);
    case 'newline':
      return serializeNewline(row, headers, includeEmptyCells);
    case 'sentence':
      return serializeSentence(row, headers, options);
    case 'template':
      return serializeTemplate(row, headers, options);
    default:
      return serializeKeyValue(row, headers, includeEmptyCells);
  }
}

/**
 * Key-value format: "Header1: value1, Header2: value2"
 */
function serializeKeyValue(row: string[], headers: string[], includeEmptyCells: boolean): string {
  const pairs: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const value = row[i] ?? '';
    if (!includeEmptyCells && value.trim() === '') continue;
    pairs.push(`${headers[i]}: ${value}`);
  }
  return pairs.join(', ');
}

/**
 * Newline format: "Header1: value1\nHeader2: value2"
 */
function serializeNewline(row: string[], headers: string[], includeEmptyCells: boolean): string {
  const lines: string[] = [];
  for (let i = 0; i < headers.length; i++) {
    const value = row[i] ?? '';
    if (!includeEmptyCells && value.trim() === '') continue;
    lines.push(`${headers[i]}: ${value}`);
  }
  return lines.join('\n');
}

/**
 * Sentence format: "Subject is Value2, Header3 Value3, and Header4 Value4."
 */
function serializeSentence(
  row: string[],
  headers: string[],
  options?: SerializeRowOptions
): string {
  const subjectCol = options?.sentenceSubjectColumn ?? 0;
  const includeEmptyCells = options?.includeEmptyCells ?? false;

  if (row.length === 0 || headers.length === 0) return '';

  const subject = row[subjectCol] ?? '';
  const clauses: string[] = [];

  for (let i = 0; i < headers.length; i++) {
    if (i === subjectCol) continue;
    const value = row[i] ?? '';
    if (!includeEmptyCells && value.trim() === '') continue;
    clauses.push(`${headers[i]}: ${value}`);
  }

  if (clauses.length === 0) return `${subject}.`;

  if (clauses.length === 1) {
    return `${subject}, ${clauses[0]}.`;
  }

  const allButLast = clauses.slice(0, -1).join(', ');
  const last = clauses[clauses.length - 1];
  return `${subject}, ${allButLast}, and ${last}.`;
}

/**
 * Template format: "{{Header}} placeholder replacement"
 */
function serializeTemplate(
  row: string[],
  headers: string[],
  options?: SerializeRowOptions
): string {
  const template = options?.template ?? '';
  const caseSensitive = options?.templateCaseSensitive ?? false;
  const removeMissing = options?.removeMissingPlaceholders ?? false;

  let result = template;

  // Build header lookup
  const headerMap = new Map<string, string>();
  for (let i = 0; i < headers.length; i++) {
    const key = caseSensitive ? headers[i] : headers[i].toLowerCase();
    headerMap.set(key, row[i] ?? '');
  }

  // Replace {{placeholder}} patterns
  result = result.replace(/\{\{([^}]+)\}\}/g, (_match, placeholder: string) => {
    const key = caseSensitive ? placeholder.trim() : placeholder.trim().toLowerCase();
    if (headerMap.has(key)) {
      return headerMap.get(key)!;
    }
    return removeMissing ? '' : _match;
  });

  return result;
}

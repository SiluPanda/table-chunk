// table-chunk - Extract and chunk tables preserving row/column structure

export {
  Table,
  TableMetadata,
  TableChunk,
  TableChunkMetadata,
  TableRegion,
  ChunkTableOptions,
  SerializeRowOptions,
  TableChunker,
  TableFormat,
  ChunkStrategy,
  RowOutputFormat,
  SerializationFormat,
} from './types';

export { serializeRow } from './serialize';
export { estimateTokens } from './tokens';
export { detectTables } from './extract';

import { Table, ChunkTableOptions, TableFormat, TableChunker } from './types';
import { parseMarkdownTable } from './parsers/markdown';
import { parseHtmlTable } from './parsers/html';
import { parseCsvTable } from './parsers/csv';
import { chunkTable as chunkTableImpl } from './chunker';

/**
 * Detect the format of a table input string.
 */
function detectFormat(input: string): 'markdown' | 'html' | 'csv' {
  const trimmed = input.trim();

  // Check for HTML table
  if (/<table[\s>]/i.test(trimmed)) {
    return 'html';
  }

  // Check for markdown separator row
  const lines = trimmed.split('\n');
  for (let i = 1; i < lines.length && i < 5; i++) {
    const line = lines[i].trim();
    if (line.includes('-')) {
      let cleaned = line;
      if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
      if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
      const cells = cleaned.split('|');
      const isSep = cells.length >= 2 && cells.every(c => {
        const t = c.trim();
        return t.length > 0 && /^:?-+:?$/.test(t);
      });
      if (isSep) return 'markdown';
    }
  }

  return 'csv';
}

/**
 * Parse raw table input into a normalized Table object.
 */
export function parseTable(input: string, format?: TableFormat): Table {
  const resolvedFormat = format === 'auto' || !format ? detectFormat(input) : format;

  switch (resolvedFormat) {
    case 'markdown':
      return parseMarkdownTable(input);
    case 'html':
      return parseHtmlTable(input);
    case 'csv':
      return parseCsvTable(input, { format: 'csv' });
    case 'tsv':
      return parseCsvTable(input, { format: 'tsv' });
    default:
      return parseCsvTable(input, { format: 'csv' });
  }
}

/**
 * Primary entry point: detect format, parse, chunk, return TableChunk[].
 */
export function chunkTable(input: string, options?: ChunkTableOptions) {
  const format = options?.format ?? 'auto';
  const resolvedFormat = format === 'auto' ? detectFormat(input) : format;

  const parseOptions: { format?: 'csv' | 'tsv'; hasHeader?: boolean | 'auto' } = {};
  if (resolvedFormat === 'csv' || resolvedFormat === 'tsv') {
    parseOptions.format = resolvedFormat;
    parseOptions.hasHeader = options?.hasHeader;
  }

  let table: Table;
  switch (resolvedFormat) {
    case 'markdown':
      table = parseMarkdownTable(input);
      break;
    case 'html':
      table = parseHtmlTable(input, options?.preserveCellHtml);
      break;
    case 'csv':
    case 'tsv':
      table = parseCsvTable(input, parseOptions);
      break;
    default:
      table = parseCsvTable(input, { format: 'csv' });
  }

  return chunkTableImpl(table, options);
}

/**
 * Chunk an already-parsed Table object.
 */
export function chunk(table: Table, options?: ChunkTableOptions) {
  return chunkTableImpl(table, options);
}

/**
 * Factory that returns a configured chunker instance.
 */
export function createTableChunker(config: ChunkTableOptions): TableChunker {
  return {
    chunk(input: string) {
      return chunkTable(input, config);
    },
    parse(input: string) {
      const format = config.format ?? 'auto';
      return parseTable(input, format);
    },
    chunkTable(table: Table) {
      return chunkTableImpl(table, config);
    },
  };
}

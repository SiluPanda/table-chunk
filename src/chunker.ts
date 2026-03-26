import {
  Table,
  TableChunk,
  TableChunkMetadata,
  ChunkTableOptions,
  RowOutputFormat,
  SerializationFormat,
} from './types';
import { estimateTokens } from './tokens';
import { serializeRow } from './serialize';

/**
 * Chunk a parsed Table into TableChunk[].
 */
export function chunkTable(
  table: Table,
  options?: ChunkTableOptions
): TableChunk[] {
  const strategy = options?.strategy ?? 'row-based';
  const tokenCounter = options?.tokenCounter ?? estimateTokens;
  const tableIndex = options?.tableIndex ?? 0;

  switch (strategy) {
    case 'row-based':
      return chunkRowBased(table, options ?? {}, tokenCounter, tableIndex);
    case 'serialized':
      return chunkSerialized(table, options ?? {}, tokenCounter, tableIndex);
    case 'column-based':
      return chunkColumnBased(table, options ?? {}, tokenCounter, tableIndex);
    case 'cell-level':
      return chunkCellLevel(table, options ?? {}, tokenCounter, tableIndex);
    case 'section-based':
      return chunkSectionBased(table, options ?? {}, tokenCounter, tableIndex);
    case 'whole-table':
      return chunkWholeTable(table, options ?? {}, tokenCounter, tableIndex);
    default:
      return chunkRowBased(table, options ?? {}, tokenCounter, tableIndex);
  }
}

// -------------------------------------------------------------------
// Row-based chunking
// -------------------------------------------------------------------

function chunkRowBased(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const outputFormat = options.outputFormat ?? 'markdown';
  const maxTokens = options.maxTokens;
  const rowsPerChunk = options.rowsPerChunk ?? 10;

  const { headers, rows, metadata: tableMeta } = table;

  if (rows.length === 0) {
    // Produce a single chunk with just the headers
    const text = formatTable(headers, [], outputFormat);
    return [makeChunk(text, {
      chunkIndex: 0,
      totalChunks: 1,
      tableIndex,
      rowRange: [0, 0],
      headers,
      sourceFormat: tableMeta.format,
      strategy: 'row-based',
      tableRowCount: tableMeta.rowCount,
      tableColumnCount: tableMeta.columnCount,
      tokenCount: tokenCounter(text),
      hadMergedCells: tableMeta.hadMergedCells,
      caption: tableMeta.caption,
    })];
  }

  // Build row batches
  const batches: string[][][] = [];

  if (maxTokens) {
    // Token-bounded batching
    let currentBatch: string[][] = [];
    for (const row of rows) {
      const testBatch = [...currentBatch, row];
      const testText = formatTable(headers, testBatch, outputFormat);
      if (tokenCounter(testText) > maxTokens && currentBatch.length > 0) {
        batches.push(currentBatch);
        currentBatch = [row];
      } else {
        currentBatch = testBatch;
      }
    }
    if (currentBatch.length > 0) {
      batches.push(currentBatch);
    }
  } else {
    // Fixed row count batching
    for (let i = 0; i < rows.length; i += rowsPerChunk) {
      batches.push(rows.slice(i, i + rowsPerChunk));
    }
  }

  let rowOffset = 0;
  return batches.map((batch, idx) => {
    const text = formatTable(headers, batch, outputFormat);
    const startRow = rowOffset;
    const endRow = rowOffset + batch.length;
    rowOffset = endRow;

    return makeChunk(text, {
      chunkIndex: idx,
      totalChunks: batches.length,
      tableIndex,
      rowRange: [startRow, endRow],
      headers,
      sourceFormat: tableMeta.format,
      strategy: 'row-based',
      tableRowCount: tableMeta.rowCount,
      tableColumnCount: tableMeta.columnCount,
      tokenCount: tokenCounter(text),
      hadMergedCells: tableMeta.hadMergedCells,
      caption: tableMeta.caption,
    });
  });
}

// -------------------------------------------------------------------
// Serialized chunking
// -------------------------------------------------------------------

function chunkSerialized(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const serialization = options.serialization ?? { format: 'key-value' };
  const serFormat: SerializationFormat = serialization.format ?? 'key-value';
  const maxTokens = options.maxTokens;
  const rowsPerChunk = options.rowsPerChunk ?? 1;
  const includeEmptyCells = options.includeEmptyCells ?? serialization.includeEmptyCells ?? false;

  const { headers, rows, metadata: tableMeta } = table;

  if (rows.length === 0) {
    return [];
  }

  const serOptions = { ...serialization, includeEmptyCells };

  // Serialize all rows
  const serializedRows = rows.map(row => serializeRow(row, headers, serOptions));

  // Build batches
  const batches: { serialized: string[]; startRow: number; endRow: number }[] = [];

  if (maxTokens) {
    let currentBatch: string[] = [];
    let batchStart = 0;
    for (let i = 0; i < serializedRows.length; i++) {
      const testBatch = [...currentBatch, serializedRows[i]];
      const testText = testBatch.join('\n\n');
      if (tokenCounter(testText) > maxTokens && currentBatch.length > 0) {
        batches.push({ serialized: currentBatch, startRow: batchStart, endRow: batchStart + currentBatch.length });
        currentBatch = [serializedRows[i]];
        batchStart = i;
      } else {
        currentBatch = testBatch;
      }
    }
    if (currentBatch.length > 0) {
      batches.push({ serialized: currentBatch, startRow: batchStart, endRow: batchStart + currentBatch.length });
    }
  } else {
    for (let i = 0; i < serializedRows.length; i += rowsPerChunk) {
      const end = Math.min(i + rowsPerChunk, serializedRows.length);
      batches.push({ serialized: serializedRows.slice(i, end), startRow: i, endRow: end });
    }
  }

  return batches.map((batch, idx) => {
    const text = batch.serialized.join('\n\n');
    return makeChunk(text, {
      chunkIndex: idx,
      totalChunks: batches.length,
      tableIndex,
      rowRange: [batch.startRow, batch.endRow],
      headers,
      sourceFormat: tableMeta.format,
      strategy: 'serialized',
      serializationFormat: serFormat,
      tableRowCount: tableMeta.rowCount,
      tableColumnCount: tableMeta.columnCount,
      tokenCount: tokenCounter(text),
      hadMergedCells: tableMeta.hadMergedCells,
      caption: tableMeta.caption,
    });
  });
}

// -------------------------------------------------------------------
// Column-based chunking
// -------------------------------------------------------------------

function chunkColumnBased(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const columnsPerChunk = options.columnsPerChunk ?? 5;
  const anchorColumns = options.anchorColumns ?? [0];
  const columnOverlap = options.columnOverlap ?? 1;
  const outputFormat = options.outputFormat ?? 'markdown';

  const { headers, rows, metadata: tableMeta } = table;
  const totalCols = headers.length;

  // Build column groups
  const nonAnchorCols = Array.from({ length: totalCols }, (_, i) => i)
    .filter(i => !anchorColumns.includes(i));

  const groups: number[][] = [];
  const effectivePerChunk = Math.max(1, columnsPerChunk - anchorColumns.length);
  const safeOverlap = Math.min(columnOverlap, effectivePerChunk - 1);

  for (let i = 0; i < nonAnchorCols.length; i += effectivePerChunk - (i === 0 ? 0 : safeOverlap)) {
    const groupCols = nonAnchorCols.slice(i, i + effectivePerChunk);
    if (groupCols.length === 0) break;
    // Combine anchor columns with group columns
    const allCols = [...anchorColumns, ...groupCols].sort((a, b) => a - b);
    groups.push(allCols);
    if (i + effectivePerChunk >= nonAnchorCols.length) break;
  }

  if (groups.length === 0) {
    groups.push(anchorColumns.slice().sort((a, b) => a - b));
  }

  return groups.map((colIndices, idx) => {
    const subHeaders = colIndices.map(c => headers[c]);
    const subRows = rows.map(row => colIndices.map(c => row[c] ?? ''));
    const text = formatTable(subHeaders, subRows, outputFormat);

    const minCol = Math.min(...colIndices);
    const maxCol = Math.max(...colIndices);

    return makeChunk(text, {
      chunkIndex: idx,
      totalChunks: groups.length,
      tableIndex,
      columnRange: [minCol, maxCol + 1],
      headers: subHeaders,
      sourceFormat: tableMeta.format,
      strategy: 'column-based',
      tableRowCount: tableMeta.rowCount,
      tableColumnCount: tableMeta.columnCount,
      tokenCount: tokenCounter(text),
      hadMergedCells: tableMeta.hadMergedCells,
      caption: tableMeta.caption,
    });
  });
}

// -------------------------------------------------------------------
// Cell-level chunking
// -------------------------------------------------------------------

function chunkCellLevel(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const identifierColumn = options.identifierColumn ?? 0;
  const { headers, rows, metadata: tableMeta } = table;
  const chunks: TableChunk[] = [];

  const idHeader = headers[identifierColumn] ?? `Column ${identifierColumn + 1}`;

  for (let r = 0; r < rows.length; r++) {
    const row = rows[r];
    const identifier = (row[identifierColumn] ?? '').trim() || `Row ${r + 1}`;

    for (let c = 0; c < headers.length; c++) {
      if (c === identifierColumn) continue;
      const columnName = headers[c];
      const value = row[c] ?? '';

      const text = `${idHeader}: ${identifier} | ${columnName}: ${value}`;

      chunks.push(makeChunk(text, {
        chunkIndex: chunks.length,
        totalChunks: 0, // Will be patched after
        tableIndex,
        rowRange: [r, r + 1],
        headers: [idHeader, columnName],
        sourceFormat: tableMeta.format,
        strategy: 'cell-level',
        tableRowCount: tableMeta.rowCount,
        tableColumnCount: tableMeta.columnCount,
        tokenCount: tokenCounter(text),
        hadMergedCells: tableMeta.hadMergedCells,
        caption: tableMeta.caption,
        cellContext: {
          rowIdentifier: identifier,
          columnName,
        },
      }));
    }
  }

  // Patch totalChunks
  for (const chunk of chunks) {
    chunk.metadata.totalChunks = chunks.length;
  }

  return chunks;
}

// -------------------------------------------------------------------
// Section-based chunking
// -------------------------------------------------------------------

function chunkSectionBased(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const sectionColumn = options.sectionColumn;
  const outputFormat = options.outputFormat ?? 'markdown';
  const { headers, rows, metadata: tableMeta } = table;

  // Find section boundaries
  const sections: { label?: string; rows: string[][]; startRow: number }[] = [];
  let currentSection: string[][] = [];
  let currentLabel: string | undefined;
  let sectionStart = 0;

  if (sectionColumn !== undefined) {
    // Section by column value changes
    let prevValue = '';
    for (let i = 0; i < rows.length; i++) {
      const value = rows[i][sectionColumn] ?? '';
      if (value !== prevValue && i > 0) {
        sections.push({ label: currentLabel, rows: currentSection, startRow: sectionStart });
        currentSection = [];
        sectionStart = i;
      }
      currentLabel = value || undefined;
      currentSection.push(rows[i]);
      prevValue = value;
    }
  } else {
    // Section by blank rows or section header rows
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const allEmpty = row.every(cell => cell.trim() === '');

      if (allEmpty) {
        // Blank row = section boundary
        if (currentSection.length > 0) {
          sections.push({ label: currentLabel, rows: currentSection, startRow: sectionStart });
          currentSection = [];
          currentLabel = undefined;
          sectionStart = i + 1;
        }
        continue;
      }

      // Check for section header row: first cell non-empty, all others empty
      const isSectionHeader = row[0].trim() !== '' &&
        row.slice(1).every(cell => cell.trim() === '') &&
        headers.length > 1;

      if (isSectionHeader && currentSection.length > 0) {
        sections.push({ label: currentLabel, rows: currentSection, startRow: sectionStart });
        currentSection = [];
        currentLabel = row[0].trim();
        sectionStart = i + 1;
      } else if (isSectionHeader && currentSection.length === 0) {
        currentLabel = row[0].trim();
        sectionStart = i + 1;
      } else {
        currentSection.push(row);
      }
    }
  }

  if (currentSection.length > 0) {
    sections.push({ label: currentLabel, rows: currentSection, startRow: sectionStart });
  }

  if (sections.length === 0) {
    // No sections found, return whole table as single chunk
    return chunkRowBased(table, options, tokenCounter, tableIndex);
  }

  return sections.map((section, idx) => {
    const text = formatTable(headers, section.rows, outputFormat);
    return makeChunk(text, {
      chunkIndex: idx,
      totalChunks: sections.length,
      tableIndex,
      rowRange: [section.startRow, section.startRow + section.rows.length],
      headers,
      sourceFormat: tableMeta.format,
      strategy: 'section-based',
      tableRowCount: tableMeta.rowCount,
      tableColumnCount: tableMeta.columnCount,
      tokenCount: tokenCounter(text),
      hadMergedCells: tableMeta.hadMergedCells,
      caption: tableMeta.caption,
      sectionLabel: section.label,
    });
  });
}

// -------------------------------------------------------------------
// Whole-table chunking
// -------------------------------------------------------------------

function chunkWholeTable(
  table: Table,
  options: ChunkTableOptions,
  tokenCounter: (text: string) => number,
  tableIndex: number
): TableChunk[] {
  const outputFormat = options.outputFormat ?? 'markdown';
  const maxTokens = options.maxTokens;
  const { headers, rows, metadata: tableMeta } = table;

  const text = formatTable(headers, rows, outputFormat);
  const tokenCount = tokenCounter(text);
  const oversized = maxTokens ? tokenCount > maxTokens : false;

  return [makeChunk(text, {
    chunkIndex: 0,
    totalChunks: 1,
    tableIndex,
    rowRange: [0, rows.length],
    headers,
    sourceFormat: tableMeta.format,
    strategy: 'whole-table',
    tableRowCount: tableMeta.rowCount,
    tableColumnCount: tableMeta.columnCount,
    tokenCount,
    hadMergedCells: tableMeta.hadMergedCells,
    oversized: oversized || undefined,
    caption: tableMeta.caption,
  })];
}

// -------------------------------------------------------------------
// Formatting helpers
// -------------------------------------------------------------------

/**
 * Format a table with headers and rows into the specified output format.
 */
export function formatTable(
  headers: string[],
  rows: string[][],
  format: RowOutputFormat
): string {
  switch (format) {
    case 'markdown':
      return formatMarkdown(headers, rows);
    case 'csv':
      return formatCsv(headers, rows, ',');
    case 'tsv':
      return formatCsv(headers, rows, '\t');
    case 'plain':
      return formatPlain(headers, rows);
    default:
      return formatMarkdown(headers, rows);
  }
}

function formatMarkdown(headers: string[], rows: string[][]): string {
  const headerRow = `| ${headers.join(' | ')} |`;
  const separatorRow = `| ${headers.map(() => '---').join(' | ')} |`;
  const dataRows = rows.map(row => `| ${row.join(' | ')} |`);
  return [headerRow, separatorRow, ...dataRows].join('\n');
}

function formatCsv(headers: string[], rows: string[][], delimiter: string): string {
  const escape = (val: string) => {
    if (val.includes(delimiter) || val.includes('"') || val.includes('\n')) {
      return `"${val.replace(/"/g, '""')}"`;
    }
    return val;
  };
  const headerRow = headers.map(escape).join(delimiter);
  const dataRows = rows.map(row => row.map(escape).join(delimiter));
  return [headerRow, ...dataRows].join('\n');
}

function formatPlain(headers: string[], rows: string[][]): string {
  const headerRow = headers.join(' | ');
  const dataRows = rows.map(row => row.join(' | '));
  return [headerRow, ...dataRows].join('\n');
}

// -------------------------------------------------------------------
// Chunk constructor
// -------------------------------------------------------------------

function makeChunk(text: string, metadata: TableChunkMetadata): TableChunk {
  return { text, metadata };
}

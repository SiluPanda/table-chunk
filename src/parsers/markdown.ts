import { Table, TableMetadata } from '../types';

/**
 * Split a markdown table row on unescaped pipe characters.
 * Handles escaped pipes (\|) by preserving them as literal |.
 */
function splitRow(line: string): string[] {
  let trimmed = line.trim();

  // Strip leading pipe
  if (trimmed.startsWith('|')) {
    trimmed = trimmed.slice(1);
  }
  // Strip trailing pipe
  if (trimmed.endsWith('|') && !trimmed.endsWith('\\|')) {
    trimmed = trimmed.slice(0, -1);
  }

  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && i + 1 < trimmed.length && trimmed[i + 1] === '|') {
      current += '|';
      i++; // skip the pipe
    } else if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());

  return cells;
}

/**
 * Check if a line is a GFM separator row.
 * Each cell must match /^:?-+:?$/ after trimming.
 */
function isSeparatorRow(line: string): boolean {
  const cells = splitRow(line);
  if (cells.length === 0) return false;

  return cells.every(cell => {
    const trimmed = cell.trim();
    if (trimmed.length === 0) return false;
    return /^:?-+:?$/.test(trimmed);
  });
}

/**
 * Parse alignment from a separator cell.
 */
function parseAlignment(cell: string): 'left' | 'center' | 'right' | 'none' {
  const trimmed = cell.trim();
  const left = trimmed.startsWith(':');
  const right = trimmed.endsWith(':');
  if (left && right) return 'center';
  if (right) return 'right';
  if (left) return 'left';
  return 'none';
}

/**
 * Strip inline markdown formatting from header cells:
 * **bold**, *italic*, `code`, [link](url), ~~strikethrough~~
 */
function stripMarkdownFormatting(text: string): string {
  let result = text;
  // Bold: **text** or __text__
  result = result.replace(/\*\*(.+?)\*\*/g, '$1');
  result = result.replace(/__(.+?)__/g, '$1');
  // Italic: *text* or _text_
  result = result.replace(/\*(.+?)\*/g, '$1');
  result = result.replace(/_(.+?)_/g, '$1');
  // Strikethrough: ~~text~~
  result = result.replace(/~~(.+?)~~/g, '$1');
  // Code: `text`
  result = result.replace(/`(.+?)`/g, '$1');
  // Links: [text](url)
  result = result.replace(/\[(.+?)\]\(.+?\)/g, '$1');
  return result;
}

/**
 * Check if a line looks like a pipe-delimited table row.
 */
export function isPipeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length === 0) return false;
  // Must contain at least one pipe
  // Count unescaped pipes
  let pipeCount = 0;
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '|' && (i === 0 || trimmed[i - 1] !== '\\')) {
      pipeCount++;
    }
  }
  return pipeCount >= 1;
}

/**
 * Parse a GFM pipe table string into a Table object.
 */
export function parseMarkdownTable(input: string): Table {
  const lines = input.split('\n').filter(l => l.trim().length > 0);

  if (lines.length < 2) {
    throw new Error('Invalid markdown table: needs at least a header and separator row');
  }

  // Find separator row
  let separatorIndex = -1;
  for (let i = 1; i < lines.length; i++) {
    if (isSeparatorRow(lines[i])) {
      separatorIndex = i;
      break;
    }
  }

  if (separatorIndex === -1) {
    throw new Error('Invalid markdown table: no separator row found');
  }

  // Header is the row before the separator
  const headerLine = lines[separatorIndex - 1];
  const separatorLine = lines[separatorIndex];
  const dataLines = lines.slice(separatorIndex + 1);

  const rawHeaders = splitRow(headerLine);
  const separatorCells = splitRow(separatorLine);

  // Parse alignment
  const alignment = separatorCells.map(parseAlignment);

  // Strip formatting from headers
  const headers = rawHeaders.map(h => stripMarkdownFormatting(h.trim()));
  const columnCount = headers.length;

  // Parse data rows
  const rows: string[][] = [];
  for (const line of dataLines) {
    if (!isPipeTableRow(line)) continue;
    const cells = splitRow(line);
    // Pad or truncate to match header column count
    const normalizedRow = new Array(columnCount).fill('');
    for (let i = 0; i < Math.min(cells.length, columnCount); i++) {
      normalizedRow[i] = cells[i];
    }
    rows.push(normalizedRow);
  }

  const metadata: TableMetadata = {
    format: 'markdown',
    rowCount: rows.length,
    columnCount,
    inferredHeaders: false,
    alignment,
  };

  return { headers, rows, metadata };
}

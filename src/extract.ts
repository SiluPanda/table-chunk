import { TableRegion } from './types';
import { isPipeTableRow } from './parsers/markdown';

/**
 * Detect all table regions in a mixed-content document.
 * Supports markdown GFM pipe tables and HTML <table> elements.
 */
export function detectTables(
  document: string,
  format?: 'auto' | 'markdown' | 'html'
): TableRegion[] {
  const regions: TableRegion[] = [];
  const detectFormat = format ?? 'auto';

  if (detectFormat === 'auto' || detectFormat === 'markdown') {
    regions.push(...detectMarkdownTables(document));
  }

  if (detectFormat === 'auto' || detectFormat === 'html') {
    regions.push(...detectHtmlTables(document));
  }

  // Sort by position (markdown by startLine, HTML by startOffset)
  regions.sort((a, b) => {
    const posA = a.startLine ?? a.startOffset ?? 0;
    const posB = b.startLine ?? b.startOffset ?? 0;
    return posA - posB;
  });

  return regions;
}

/**
 * Detect markdown GFM pipe tables in a document.
 * Excludes tables inside fenced code blocks.
 */
function detectMarkdownTables(document: string): TableRegion[] {
  const lines = document.split('\n');
  const regions: TableRegion[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();

    // Track fenced code blocks
    if (trimmed.startsWith('```') || trimmed.startsWith('~~~')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    // Look for separator row pattern
    if (!isSeparatorRow(trimmed)) continue;

    // The line before the separator should be a pipe-delimited row (the header)
    if (i === 0) continue;
    const headerLine = lines[i - 1].trim();
    if (!isPipeTableRow(headerLine)) continue;

    // Count columns in separator
    const separatorCells = splitSeparatorRow(trimmed);
    if (separatorCells.length < 2) continue; // Tables must have at least 2 columns

    // Find the start (header row)
    const startLine = i - 1;

    // Find the end: consecutive pipe-delimited rows after separator
    let endLine = i; // separator itself
    for (let j = i + 1; j < lines.length; j++) {
      const nextTrimmed = lines[j].trim();
      if (nextTrimmed.length === 0) break;
      if (!isPipeTableRow(nextTrimmed)) break;
      endLine = j;
    }

    // Estimate dimensions
    const estimatedColumns = separatorCells.length;
    const estimatedRows = endLine - i; // data rows only (not header or separator)

    const content = lines.slice(startLine, endLine + 1).join('\n');

    regions.push({
      format: 'markdown',
      startLine,
      endLine,
      estimatedRows,
      estimatedColumns,
      content,
    });

    // Skip past this table
    i = endLine;
  }

  return regions;
}

/**
 * Check if a line is a GFM separator row.
 */
function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;

  let cleaned = trimmed;
  if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);

  const cells = cleaned.split('|');
  if (cells.length < 1) return false;

  return cells.every(cell => {
    const c = cell.trim();
    if (c.length === 0) return false;
    return /^:?-+:?$/.test(c);
  });
}

/**
 * Split separator row into cells.
 */
function splitSeparatorRow(line: string): string[] {
  let cleaned = line.trim();
  if (cleaned.startsWith('|')) cleaned = cleaned.slice(1);
  if (cleaned.endsWith('|')) cleaned = cleaned.slice(0, -1);
  return cleaned.split('|').map(c => c.trim()).filter(c => c.length > 0);
}

/**
 * Detect HTML <table> elements in a document.
 */
function detectHtmlTables(document: string): TableRegion[] {
  const regions: TableRegion[] = [];
  const lowerDoc = document.toLowerCase();
  let searchFrom = 0;

  while (searchFrom < lowerDoc.length) {
    const tableStart = lowerDoc.indexOf('<table', searchFrom);
    if (tableStart === -1) break;

    // Find the matching closing tag, respecting nesting
    let depth = 0;
    let pos = tableStart;
    let endPos = -1;

    while (pos < lowerDoc.length) {
      const nextOpen = lowerDoc.indexOf('<table', pos + (depth === 0 ? 1 : 6));
      const nextClose = lowerDoc.indexOf('</table>', pos + 1);

      if (nextClose === -1) {
        // No closing tag found
        break;
      }

      if (nextOpen !== -1 && nextOpen < nextClose) {
        // Nested table
        depth++;
        pos = nextOpen;
      } else {
        if (depth === 0) {
          endPos = nextClose + '</table>'.length;
          break;
        }
        depth--;
        pos = nextClose;
      }
    }

    if (endPos === -1) {
      searchFrom = tableStart + 1;
      continue;
    }

    const tableContent = document.slice(tableStart, endPos);

    // Estimate dimensions by counting <tr> and <td>/<th> in first row
    const trMatches = tableContent.match(/<tr[\s>]/gi) ?? [];
    const estimatedRows = Math.max(0, trMatches.length - 1); // Subtract header row

    // Count columns from first row
    const firstRowMatch = tableContent.match(/<tr[^>]*>([\s\S]*?)<\/tr>/i);
    let estimatedColumns = 0;
    if (firstRowMatch) {
      const cellMatches = firstRowMatch[1].match(/<(?:td|th)[\s>]/gi) ?? [];
      estimatedColumns = cellMatches.length;
    }

    regions.push({
      format: 'html',
      startOffset: tableStart,
      endOffset: endPos,
      estimatedRows,
      estimatedColumns,
      content: tableContent,
    });

    searchFrom = endPos;
  }

  return regions;
}

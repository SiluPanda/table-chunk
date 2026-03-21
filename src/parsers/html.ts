import { Table, TableMetadata } from '../types';

interface HtmlCell {
  text: string;
  isHeader: boolean;
  rowspan: number;
  colspan: number;
}

interface HtmlRow {
  cells: HtmlCell[];
  inThead: boolean;
}

/**
 * Strip HTML tags from a string, decoding basic entities.
 */
function stripHtmlTags(html: string): string {
  let text = html.replace(/<br\s*\/?>/gi, ' ');
  text = text.replace(/<[^>]*>/g, '');
  // Decode common HTML entities
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\s+/g, ' ').trim();
  return text;
}

/**
 * Extract attribute value from a tag string.
 */
function getAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']*)["']`, 'i');
  const match = tag.match(re);
  return match ? match[1] : undefined;
}

/**
 * Minimal HTML table parser. Handles <table>, <thead>, <tbody>, <tfoot>,
 * <tr>, <th>, <td>, rowspan, colspan, and <caption>.
 * No runtime dependencies.
 */
export function parseHtmlTable(input: string, preserveCellHtml = false): Table {
  // Find the outermost <table> ... </table>
  const tableMatch = input.match(/<table[^>]*>([\s\S]*?)<\/table>/i);
  if (!tableMatch) {
    throw new Error('No <table> element found in input');
  }

  const tableTag = input.match(/<table[^>]*>/i)?.[0] ?? '';
  const htmlSummary = getAttr(tableTag, 'summary');
  const tableContent = tableMatch[1];

  // Extract caption
  const captionMatch = tableContent.match(/<caption[^>]*>([\s\S]*?)<\/caption>/i);
  const caption = captionMatch ? stripHtmlTags(captionMatch[1]) : undefined;

  // Parse all rows with their context (thead, tbody, tfoot)
  const parsedRows: HtmlRow[] = [];
  let inThead = false;

  // We'll do a simple regex-based scan for structure
  // Track sections
  const tokens = tokenizeHtml(tableContent);

  let currentRow: HtmlCell[] | null = null;
  let currentCellContent = '';
  let currentCellTag = '';
  let inCell = false;

  for (const token of tokens) {
    if (token.type === 'tag') {
      const tagName = token.name.toLowerCase();
      const isClose = token.isClose;

      // Structural table tags
      if (tagName === 'thead') {
        inThead = !isClose;
      } else if (tagName === 'tfoot' || tagName === 'tbody') {
        // tbody doesn't affect header detection directly
      } else if (tagName === 'tr') {
        if (!isClose) {
          currentRow = [];
        } else if (currentRow) {
          parsedRows.push({
            cells: currentRow,
            inThead,
          });
          currentRow = null;
        }
      } else if (tagName === 'th' || tagName === 'td') {
        if (!isClose) {
          inCell = true;
          currentCellContent = '';
          currentCellTag = token.raw;
        } else {
          inCell = false;
          if (currentRow) {
            const rowspan = parseInt(getAttr(currentCellTag, 'rowspan') ?? '1', 10) || 1;
            const colspan = parseInt(getAttr(currentCellTag, 'colspan') ?? '1', 10) || 1;
            const text = preserveCellHtml ? currentCellContent.trim() : stripHtmlTags(currentCellContent);
            currentRow.push({
              text,
              isHeader: tagName === 'th' || inThead,
              rowspan,
              colspan,
            });
          }
        }
      } else if (inCell) {
        // Nested tags inside a cell (e.g. <b>, <a>, <span>)
        currentCellContent += token.raw;
      }
    } else if (token.type === 'text') {
      if (inCell) {
        currentCellContent += token.raw;
      }
    }
  }

  // Now build the grid with rowspan/colspan expansion
  if (parsedRows.length === 0) {
    return {
      headers: ['Column 1'],
      rows: [],
      metadata: {
        format: 'html',
        rowCount: 0,
        columnCount: 1,
        inferredHeaders: true,
        caption,
        htmlSummary,
      },
    };
  }

  // Determine max columns
  let maxCols = 0;
  for (const row of parsedRows) {
    let colCount = 0;
    for (const cell of row.cells) {
      colCount += cell.colspan;
    }
    if (colCount > maxCols) maxCols = colCount;
  }

  // Build the grid
  const totalRows = parsedRows.length;
  const grid: (string | null)[][] = Array.from({ length: totalRows }, () =>
    new Array(maxCols).fill(null)
  );
  const isHeaderGrid: boolean[][] = Array.from({ length: totalRows }, () =>
    new Array(maxCols).fill(false)
  );

  let hadMergedCells = false;

  for (let r = 0; r < totalRows; r++) {
    const row = parsedRows[r];
    let colCursor = 0;

    for (const cell of row.cells) {
      // Skip to the next unfilled position
      while (colCursor < maxCols && grid[r][colCursor] !== null) {
        colCursor++;
      }
      if (colCursor >= maxCols) break;

      if (cell.rowspan > 1 || cell.colspan > 1) {
        hadMergedCells = true;
      }

      // Fill the cell and its span
      for (let dr = 0; dr < cell.rowspan; dr++) {
        for (let dc = 0; dc < cell.colspan; dc++) {
          const gr = r + dr;
          const gc = colCursor + dc;
          if (gr < totalRows && gc < maxCols) {
            grid[gr][gc] = cell.text;
            isHeaderGrid[gr][gc] = cell.isHeader || row.inThead;
          }
        }
      }

      colCursor += cell.colspan;
    }
  }

  // Fill any remaining null cells with empty string
  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < maxCols; c++) {
      if (grid[r][c] === null) {
        grid[r][c] = '';
      }
    }
  }

  // Identify header rows: rows where all cells are headers
  const headerRowIndices: number[] = [];
  for (let r = 0; r < totalRows; r++) {
    const allHeaders = isHeaderGrid[r].every(h => h);
    if (allHeaders && headerRowIndices.length === r) {
      // Only consecutive header rows from the top count
      headerRowIndices.push(r);
    }
  }

  let headers: string[];
  let dataRows: string[][];
  let inferredHeaders = false;
  let originalHeaderLevels: string[][] | undefined;

  if (headerRowIndices.length === 0) {
    // No header row detected - use first row as header
    if (totalRows > 0) {
      headers = grid[0] as string[];
      dataRows = grid.slice(1) as string[][];
    } else {
      headers = Array.from({ length: maxCols }, (_, i) => `Column ${i + 1}`);
      dataRows = [];
      inferredHeaders = true;
    }
  } else if (headerRowIndices.length === 1) {
    headers = grid[headerRowIndices[0]] as string[];
    dataRows = grid.slice(headerRowIndices.length) as string[][];
  } else {
    // Multi-level headers: flatten
    originalHeaderLevels = headerRowIndices.map(r => grid[r] as string[]);
    headers = flattenMultiLevelHeaders(originalHeaderLevels);
    dataRows = grid.slice(headerRowIndices.length) as string[][];
  }

  const metadata: TableMetadata = {
    format: 'html',
    rowCount: dataRows.length,
    columnCount: maxCols,
    inferredHeaders,
    caption,
    htmlSummary,
    hadMergedCells: hadMergedCells || undefined,
    originalHeaderLevels,
  };

  return { headers, rows: dataRows, metadata };
}

/**
 * Flatten multi-level headers by joining parent header text with child header text.
 */
function flattenMultiLevelHeaders(levels: string[][]): string[] {
  if (levels.length === 0) return [];
  if (levels.length === 1) return levels[0];

  const colCount = levels[0].length;
  const result: string[] = [];

  for (let c = 0; c < colCount; c++) {
    const parts: string[] = [];
    for (const level of levels) {
      const val = (level[c] ?? '').trim();
      if (val && !parts.includes(val)) {
        parts.push(val);
      }
    }
    result.push(parts.join(' '));
  }

  // Deduplicate identical names by adding numeric suffix
  const nameCount = new Map<string, number>();
  for (const name of result) {
    nameCount.set(name, (nameCount.get(name) ?? 0) + 1);
  }
  const seen = new Map<string, number>();
  return result.map(name => {
    const count = nameCount.get(name) ?? 1;
    if (count > 1) {
      const idx = (seen.get(name) ?? 0) + 1;
      seen.set(name, idx);
      return `${name} (${idx})`;
    }
    return name;
  });
}

interface HtmlToken {
  type: 'tag' | 'text';
  raw: string;
  name: string;
  isClose: boolean;
  isSelfClosing: boolean;
}

/**
 * Simple HTML tokenizer that yields tags and text content.
 */
function tokenizeHtml(html: string): HtmlToken[] {
  const tokens: HtmlToken[] = [];
  let i = 0;
  let textBuf = '';

  while (i < html.length) {
    if (html[i] === '<') {
      // Flush text buffer
      if (textBuf) {
        tokens.push({ type: 'text', raw: textBuf, name: '', isClose: false, isSelfClosing: false });
        textBuf = '';
      }

      // Find closing >
      let j = i + 1;
      while (j < html.length && html[j] !== '>') {
        j++;
      }
      if (j >= html.length) {
        textBuf += html.slice(i);
        break;
      }

      const raw = html.slice(i, j + 1);
      const isClose = raw[1] === '/';
      const isSelfClosing = raw[j - i - 1] === '/';

      // Extract tag name
      const nameStart = isClose ? 2 : 1;
      let nameEnd = nameStart;
      while (nameEnd < raw.length && /[a-zA-Z0-9]/.test(raw[nameEnd])) {
        nameEnd++;
      }
      const name = raw.slice(nameStart, nameEnd).toLowerCase();

      tokens.push({ type: 'tag', raw, name, isClose, isSelfClosing });
      i = j + 1;
    } else {
      textBuf += html[i];
      i++;
    }
  }

  if (textBuf) {
    tokens.push({ type: 'text', raw: textBuf, name: '', isClose: false, isSelfClosing: false });
  }

  return tokens;
}

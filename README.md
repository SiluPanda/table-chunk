# table-chunk

Format-aware table extraction and chunking for RAG pipelines. Parses tables from Markdown, HTML, and CSV/TSV, then produces embedding-optimized chunks where every chunk carries its column headers.

[![npm version](https://img.shields.io/npm/v/table-chunk.svg)](https://www.npmjs.com/package/table-chunk)
[![npm downloads](https://img.shields.io/npm/dt/table-chunk.svg)](https://www.npmjs.com/package/table-chunk)
[![license](https://img.shields.io/npm/l/table-chunk.svg)](https://github.com/SiluPanda/table-chunk/blob/master/LICENSE)
[![node](https://img.shields.io/node/v/table-chunk.svg)](https://nodejs.org/)

---

## Description

Standard text splitters treat tables as flat text. When a 40-row Markdown table is split at a 512-token boundary, half the rows end up in one chunk without headers and the other half in another. The embedded vectors encode rows stripped of all column context. A retrieval query for "what was Alice's order total?" returns a chunk containing `| Alice | 847.50 | ... |` with no column headers -- the embedding model has no idea that "847.50" refers to an order total.

`table-chunk` solves this with a three-stage pipeline:

1. **Detect and extract** every table in a document (GFM pipe tables, HTML `<table>` elements with `rowspan`/`colspan`, CSV/TSV files).
2. **Normalize** the extracted table into a `Table` object with a consistent `headers: string[]` + `rows: string[][]` representation, expanding merged cells and resolving multi-level headers.
3. **Chunk** using a configurable strategy -- row-based, serialized, column-based, cell-level, section-based, or whole-table -- so that every chunk carries the headers it needs to be semantically self-contained.

Zero runtime dependencies. All Markdown, HTML, and CSV parsing is implemented from scratch with no external libraries.

---

## Installation

```bash
npm install table-chunk
```

---

## Quick Start

```typescript
import { chunkTable } from 'table-chunk';

const markdown = `| Product | SKU | Price | Stock |
| --- | --- | --- | --- |
| Widget A | W-001 | $49.99 | 240 |
| Widget B | W-002 | $39.99 | 85 |
| Gadget X | G-001 | $129.00 | 12 |
| Gadget Y | G-002 | $99.00 | 55 |
| Gizmo Z | Z-001 | $19.99 | 300 |`;

const chunks = chunkTable(markdown, {
  strategy: 'row-based',
  rowsPerChunk: 3,
});

for (const chunk of chunks) {
  console.log(chunk.text);
  // Each chunk is a self-contained table with the header row repeated
  console.log(chunk.metadata.rowRange);
  // [0, 3], [3, 5]
}
```

### Serialized output for natural language embedding

```typescript
const chunks = chunkTable(markdown, {
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  rowsPerChunk: 1,
});

console.log(chunks[0].text);
// "Product: Widget A, SKU: W-001, Price: $49.99, Stock: 240"
```

### Token-bounded chunking

```typescript
const chunks = chunkTable(markdown, {
  strategy: 'row-based',
  maxTokens: 512,
  tokenCounter: (text) => Math.ceil(text.length / 4),
});
// Rows are batched to stay within the token budget
```

### Mixed-content document workflow

```typescript
import { detectTables, parseTable, chunk } from 'table-chunk';

const document = `# Quarterly Report
Some introductory text.

| Quarter | Revenue | Profit |
| --- | --- | --- |
| Q1 | $1M | $200K |
| Q2 | $1.2M | $250K |

Conclusion text.`;

// Step 1: Find all tables in the document
const regions = detectTables(document);

// Step 2: Parse and chunk each table
for (const region of regions) {
  const table = parseTable(region.content!, 'markdown');
  const chunks = chunk(table, {
    strategy: 'serialized',
    serialization: { format: 'key-value' },
    rowsPerChunk: 2,
  });
  // Insert chunks into your vector store
}
```

---

## Features

- **Three source formats**: GFM Markdown pipe tables, HTML `<table>` elements, and CSV/TSV delimited text.
- **Six chunking strategies**: row-based, serialized, column-based, cell-level, section-based, and whole-table.
- **Header preservation**: every chunk carries its column headers regardless of strategy.
- **Format auto-detection**: automatically distinguishes Markdown, HTML, and CSV input.
- **HTML merged cell expansion**: `rowspan` and `colspan` are expanded into an explicit two-dimensional grid before chunking.
- **Multi-level HTML header flattening**: stacked `<th>` rows are flattened into qualified column names (e.g., "Q1 Revenue", "Q2 Cost").
- **CSV auto-delimiter detection**: comma, tab, semicolon, and pipe delimiters are detected automatically.
- **RFC 4180 CSV parsing**: quoted fields, escaped quotes, newlines within quoted fields, and CRLF line endings.
- **Token-bounded chunking**: when `maxTokens` is set, rows are batched to keep chunks within the token budget.
- **Pluggable token counter**: supply your own function wrapping `tiktoken`, `gpt-tokenizer`, or any provider tokenizer.
- **Rich chunk metadata**: table index, row range, column range, header list, source format, token count, strategy used, and more.
- **Table detection in mixed documents**: find all table regions in documents containing both prose and tables, respecting fenced code blocks.
- **Four serialization formats**: key-value, newline, sentence, and template.
- **Reusable chunker factory**: `createTableChunker` amortizes configuration across many calls.
- **Zero runtime dependencies**: all parsing is built in.
- **Deterministic**: same input with same options always produces the same output. No LLM calls, no network access.

---

## API Reference

### `chunkTable(input, options?)`

Primary entry point. Detects the source format, parses the table, applies the chunking strategy, and returns `TableChunk[]`.

```typescript
function chunkTable(input: string, options?: ChunkTableOptions): TableChunk[];
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `input` | `string` | Raw table content (Markdown, HTML, or CSV/TSV) |
| `options` | `ChunkTableOptions` | Configuration options (see [Configuration](#configuration)) |

**Returns:** `TableChunk[]`

```typescript
const chunks = chunkTable(htmlTable, {
  format: 'html',
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  rowsPerChunk: 1,
});
```

---

### `parseTable(input, format?)`

Parses raw table input into a normalized `Table` object without chunking.

```typescript
function parseTable(input: string, format?: TableFormat): Table;
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `input` | `string` | | Raw table content |
| `format` | `TableFormat` | `'auto'` | Source format hint |

**Returns:** `Table`

```typescript
const table = parseTable(csvData, 'csv');
console.log(table.headers);   // ['Name', 'Age', 'City']
console.log(table.rows[0]);   // ['Alice', '30', 'New York']
console.log(table.metadata);  // { format: 'csv', rowCount: 2, columnCount: 3, ... }
```

---

### `chunk(table, options?)`

Chunks an already-parsed `Table` object. Use this when you have already called `parseTable` and want to apply a chunking strategy separately.

```typescript
function chunk(table: Table, options?: ChunkTableOptions): TableChunk[];
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `table` | `Table` | A parsed table object |
| `options` | `ChunkTableOptions` | Configuration options |

**Returns:** `TableChunk[]`

```typescript
const table = parseTable(input, 'markdown');
const chunks = chunk(table, { strategy: 'row-based', rowsPerChunk: 5 });
```

---

### `detectTables(document, format?)`

Finds all table regions in a mixed-content document. Supports Markdown GFM pipe tables and HTML `<table>` elements. Ignores tables inside fenced code blocks.

```typescript
function detectTables(
  document: string,
  format?: 'auto' | 'markdown' | 'html'
): TableRegion[];
```

**Parameters:**

| Parameter | Type | Default | Description |
|---|---|---|---|
| `document` | `string` | | Full document content |
| `format` | `'auto' \| 'markdown' \| 'html'` | `'auto'` | Restrict detection to a specific format |

**Returns:** `TableRegion[]`

Each `TableRegion` contains:

| Property | Type | Description |
|---|---|---|
| `format` | `'markdown' \| 'html'` | Detected table format |
| `startLine` | `number \| undefined` | Zero-based first line (Markdown) |
| `endLine` | `number \| undefined` | Zero-based last line (Markdown) |
| `startOffset` | `number \| undefined` | Character offset of `<table>` (HTML) |
| `endOffset` | `number \| undefined` | Character offset after `</table>` (HTML) |
| `estimatedRows` | `number` | Estimated data row count |
| `estimatedColumns` | `number` | Estimated column count |
| `content` | `string \| undefined` | Raw table string extracted from the document |

```typescript
const regions = detectTables(mixedDocument);
for (const region of regions) {
  const chunks = chunkTable(region.content!, { format: region.format });
}
```

---

### `serializeRow(row, headers, options?)`

Serializes a single data row into an embedding-friendly string. Supports four serialization formats.

```typescript
function serializeRow(
  row: string[],
  headers: string[],
  options?: SerializeRowOptions
): string;
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `row` | `string[]` | Cell values for one row |
| `headers` | `string[]` | Column header names |
| `options` | `SerializeRowOptions` | Serialization configuration |

**Returns:** `string`

**Serialization formats:**

```typescript
// key-value (default)
serializeRow(['Alice', '30', 'NY'], ['Name', 'Age', 'City']);
// "Name: Alice, Age: 30, City: NY"

// newline
serializeRow(['Alice', '30', 'NY'], ['Name', 'Age', 'City'], { format: 'newline' });
// "Name: Alice\nAge: 30\nCity: NY"

// sentence
serializeRow(['Alice', '30', 'NY'], ['Name', 'Age', 'City'], { format: 'sentence' });
// "Alice, Age: 30, and City: NY."

// template
serializeRow(
  ['Widget A', 'W-001', '$49.99'],
  ['Product', 'SKU', 'Price'],
  {
    format: 'template',
    template: '{{Product}} ({{SKU}}) costs {{Price}}.',
  }
);
// "Widget A (W-001) costs $49.99."
```

---

### `estimateTokens(text)`

Default token counter using the `chars / 4` heuristic.

```typescript
function estimateTokens(text: string): number;
```

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `text` | `string` | Input text |

**Returns:** `number` -- estimated token count (`Math.ceil(text.length / 4)`)

---

### `createTableChunker(config)`

Factory that returns a configured chunker instance. Useful when processing many tables with the same configuration.

```typescript
function createTableChunker(config: ChunkTableOptions): TableChunker;
```

**Returns:** `TableChunker`

The `TableChunker` interface provides three methods:

| Method | Signature | Description |
|---|---|---|
| `chunk` | `(input: string) => TableChunk[]` | Auto-detect format, parse, and chunk |
| `parse` | `(input: string) => Table` | Auto-detect format and parse |
| `chunkTable` | `(table: Table) => TableChunk[]` | Chunk an already-parsed `Table` |

```typescript
const chunker = createTableChunker({
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  maxTokens: 512,
});

const chunks = chunker.chunk(tableHtml);
const table = chunker.parse(tableCsv);
const moreChunks = chunker.chunkTable(table);
```

---

## Configuration

### `ChunkTableOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'auto' \| 'markdown' \| 'html' \| 'csv' \| 'tsv'` | `'auto'` | Source table format. When `'auto'`, the format is detected from the input content. |
| `strategy` | `ChunkStrategy` | `'row-based'` | Chunking strategy to apply. |
| `rowsPerChunk` | `number` | `10` | Number of data rows per chunk (row-based and serialized strategies). |
| `columnsPerChunk` | `number` | `5` | Number of columns per chunk (column-based strategy). |
| `anchorColumns` | `number[]` | `[0]` | Column indices always included in every chunk (column-based strategy). |
| `columnOverlap` | `number` | `1` | Number of overlapping columns between adjacent column chunks. |
| `maxTokens` | `number` | `undefined` | Maximum token count per chunk. When set, rows are batched by token budget instead of fixed count. |
| `tokenCounter` | `(text: string) => number` | `estimateTokens` | Function to count tokens. Default uses `chars / 4`. |
| `outputFormat` | `'markdown' \| 'csv' \| 'tsv' \| 'plain'` | `'markdown'` | Output format for row-based and column-based chunk text. |
| `serialization` | `SerializeRowOptions` | `{ format: 'key-value' }` | Serialization options for the `'serialized'` strategy. |
| `sectionColumn` | `number` | `undefined` | Column index whose value changes define section boundaries (section-based strategy). |
| `identifierColumn` | `number` | `0` | Column index used as the row identifier (cell-level strategy). |
| `hasHeader` | `boolean \| 'auto'` | `'auto'` | Whether the first row is a header. When `'auto'`, headers are detected for CSV/TSV. |
| `nestedTables` | `'ignore' \| 'extract' \| 'flatten'` | `'extract'` | How to handle nested HTML tables. |
| `preserveCellHtml` | `boolean` | `false` | When `true`, preserves inner HTML markup in cell values instead of stripping tags. |
| `tableIndex` | `number` | `0` | Table index for multi-table documents. Stored in chunk metadata. |
| `includeEmptyCells` | `boolean` | `false` | Include empty cells in serialized output. |

### `SerializeRowOptions`

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'key-value' \| 'newline' \| 'sentence' \| 'template'` | `'key-value'` | Serialization format. |
| `template` | `string` | `''` | Template string with `{{ColumnName}}` placeholders (template format). |
| `templateCaseSensitive` | `boolean` | `false` | Whether template placeholder matching is case-sensitive. |
| `removeMissingPlaceholders` | `boolean` | `false` | Remove unmatched `{{placeholder}}` tokens instead of preserving them. |
| `sentenceSubjectColumn` | `number` | `0` | Column index used as the sentence subject (sentence format). |
| `includeEmptyCells` | `boolean` | `false` | Include empty cells in serialized output. |

### Chunking strategies

| Strategy | Best for | Description |
|---|---|---|
| `'row-based'` | Most tables | Groups N rows per chunk, repeating the header row in each chunk. Output format is configurable (Markdown, CSV, TSV, plain). |
| `'serialized'` | Natural language search | Converts each row to a flat string (key-value, newline, sentence, or template format). Produces the highest embedding relevance for column-value queries. |
| `'column-based'` | Wide tables (20+ columns) | Splits columns into groups, with configurable anchor columns included in every chunk. |
| `'cell-level'` | Lookup/reference tables | Produces one chunk per cell, each containing the row identifier and column name for maximum granularity. |
| `'section-based'` | Grouped/categorized tables | Splits on blank rows, section header rows, or value changes in a designated section column. |
| `'whole-table'` | Small tables | Returns the entire table as a single chunk. Marks the chunk as `oversized` if it exceeds `maxTokens`. |

---

## Error Handling

`table-chunk` throws errors in the following cases:

- **Invalid Markdown table**: `parseTable(input, 'markdown')` throws if the input has fewer than two lines (header + separator) or if no separator row is found.

```typescript
try {
  parseTable('| A | B |\n| 1 | 2 |', 'markdown');
} catch (err) {
  // Error: Invalid markdown table: no separator row found
}
```

- **Missing HTML table element**: `parseTable(input, 'html')` throws if no `<table>` element is found in the input.

```typescript
try {
  parseTable('<div>no table</div>', 'html');
} catch (err) {
  // Error: No <table> element found in input
}
```

- **Empty CSV input**: returns a `Table` with inferred headers (`['Column 1']`) and zero rows. Does not throw.

- **Oversized whole-table chunks**: when using the `'whole-table'` strategy with `maxTokens`, chunks that exceed the limit are not split further but are flagged with `metadata.oversized: true`. Check this field to detect chunks that need alternative handling.

```typescript
const chunks = chunkTable(largeTable, { strategy: 'whole-table', maxTokens: 512 });
if (chunks[0].metadata.oversized) {
  // Fall back to row-based chunking
  const smallerChunks = chunkTable(largeTable, { strategy: 'row-based', maxTokens: 512 });
}
```

---

## Advanced Usage

### Custom token counter with tiktoken

```typescript
import { chunkTable } from 'table-chunk';
import { encoding_for_model } from 'tiktoken';

const enc = encoding_for_model('gpt-4');

const chunks = chunkTable(table, {
  strategy: 'row-based',
  maxTokens: 512,
  tokenCounter: (text) => enc.encode(text).length,
});
```

### Column-based chunking for wide tables

Split a 20-column table into manageable groups while keeping an anchor column (e.g., the row identifier) in every chunk:

```typescript
const chunks = chunkTable(wideTable, {
  strategy: 'column-based',
  columnsPerChunk: 5,
  anchorColumns: [0],
  columnOverlap: 1,
});

// Every chunk includes column 0 (the anchor) plus a subset of remaining columns
for (const chunk of chunks) {
  console.log(chunk.metadata.columnRange);  // [0, 4], [0, 8], etc.
  console.log(chunk.metadata.headers);      // anchor + group headers
}
```

### Section-based chunking by column value

Split a table into sections wherever a column value changes:

```typescript
import { chunk, parseTable } from 'table-chunk';

const table = parseTable(csvData, 'csv');
const chunks = chunk(table, {
  strategy: 'section-based',
  sectionColumn: 0,  // split when column 0 value changes
});

for (const c of chunks) {
  console.log(c.metadata.sectionLabel);
  // "Engineering", "Marketing", etc.
}
```

### Template-based serialization

Use custom templates with `{{ColumnName}}` placeholders for domain-specific embedding text:

```typescript
import { serializeRow } from 'table-chunk';

const text = serializeRow(
  ['Widget A', 'W-001', '$49.99', '240'],
  ['Product', 'SKU', 'Price', 'Stock'],
  {
    format: 'template',
    template: '{{Product}} (SKU: {{SKU}}) is priced at {{Price}} with {{Stock}} units in stock.',
  }
);
// "Widget A (SKU: W-001) is priced at $49.99 with 240 units in stock."
```

Template matching is case-insensitive by default. Enable case-sensitive matching or remove unmatched placeholders:

```typescript
serializeRow(['Alice'], ['Name'], {
  format: 'template',
  template: '{{name}} -- {{Missing}}',
  templateCaseSensitive: false,
  removeMissingPlaceholders: true,
});
// "Alice -- "
```

### HTML tables with merged cells and captions

```typescript
const html = `<table summary="Q1 Financial Data">
  <caption>Quarterly Results</caption>
  <thead>
    <tr><th colspan="2">Q1</th><th colspan="2">Q2</th></tr>
    <tr><th>Revenue</th><th>Cost</th><th>Revenue</th><th>Cost</th></tr>
  </thead>
  <tbody>
    <tr><td>100</td><td>50</td><td>120</td><td>60</td></tr>
  </tbody>
</table>`;

const table = parseTable(html, 'html');
console.log(table.headers);
// ['Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost']
console.log(table.metadata.caption);
// 'Quarterly Results'
console.log(table.metadata.htmlSummary);
// 'Q1 Financial Data'
console.log(table.metadata.hadMergedCells);
// true
console.log(table.metadata.originalHeaderLevels);
// [['Q1', 'Q1', 'Q2', 'Q2'], ['Revenue', 'Cost', 'Revenue', 'Cost']]
```

### Preserving cell HTML

By default, HTML tags inside cells are stripped. To keep them:

```typescript
const chunks = chunkTable(htmlTable, {
  format: 'html',
  preserveCellHtml: true,
  strategy: 'whole-table',
});
// Cell values retain their inner HTML: "<b>Alice</b>" instead of "Alice"
```

### Sentence serialization with custom subject

```typescript
import { serializeRow } from 'table-chunk';

const text = serializeRow(
  ['Alice Johnson', '30', 'New York', 'Engineering'],
  ['Name', 'Age', 'City', 'Department'],
  {
    format: 'sentence',
    sentenceSubjectColumn: 0,
  }
);
// "Alice Johnson, Age: 30, City: New York, and Department: Engineering."
```

---

## TypeScript

`table-chunk` is written in TypeScript and ships type declarations with the package. All types are exported from the main entry point.

### Exported types

```typescript
import type {
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
} from 'table-chunk';
```

### `Table`

```typescript
interface Table {
  headers: string[];          // Column headers, one per column
  rows: string[][];           // Data rows, each with the same length as headers
  metadata: TableMetadata;    // Source format, dimensions, and parsing details
}
```

### `TableMetadata`

```typescript
interface TableMetadata {
  format: 'markdown' | 'html' | 'csv' | 'tsv';
  rowCount: number;
  columnCount: number;
  inferredHeaders: boolean;
  caption?: string;                              // HTML <caption> text
  htmlSummary?: string;                          // HTML summary attribute
  alignment?: Array<'left' | 'center' | 'right' | 'none'>;  // Markdown alignment
  hadMergedCells?: boolean;                      // True if rowspan/colspan was expanded
  originalHeaderLevels?: string[][];             // Multi-level headers before flattening
}
```

### `TableChunk`

```typescript
interface TableChunk {
  text: string;                  // Chunk text, ready for embedding
  metadata: TableChunkMetadata;  // Origin, range, and structural metadata
}
```

### `TableChunkMetadata`

```typescript
interface TableChunkMetadata {
  chunkIndex: number;
  totalChunks: number;
  tableIndex: number;
  rowRange?: [number, number];             // [startRow, endRow), exclusive end
  columnRange?: [number, number];          // [startCol, endCol), exclusive end
  headers: string[];
  sourceFormat: 'markdown' | 'html' | 'csv' | 'tsv';
  strategy: ChunkStrategy;
  serializationFormat?: SerializationFormat;
  tableRowCount: number;
  tableColumnCount: number;
  tokenCount: number;
  hadMergedCells?: boolean;
  oversized?: boolean;
  caption?: string;
  sectionLabel?: string;                   // Section-based strategy
  cellContext?: {                           // Cell-level strategy
    rowIdentifier: string;
    columnName: string;
  };
}
```

### `TableRegion`

```typescript
interface TableRegion {
  format: 'markdown' | 'html';
  startLine?: number;          // Markdown: zero-based first line
  endLine?: number;            // Markdown: zero-based last line
  startOffset?: number;        // HTML: character offset of <table>
  endOffset?: number;          // HTML: character offset after </table>
  estimatedRows: number;
  estimatedColumns: number;
  content?: string;            // Raw table string
}
```

### Type aliases

```typescript
type TableFormat = 'auto' | 'markdown' | 'html' | 'csv' | 'tsv';
type ChunkStrategy = 'row-based' | 'serialized' | 'column-based' | 'cell-level' | 'section-based' | 'whole-table';
type RowOutputFormat = 'markdown' | 'csv' | 'tsv' | 'plain';
type SerializationFormat = 'key-value' | 'newline' | 'sentence' | 'template';
```

---

## License

MIT

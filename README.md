# table-chunk

Extract tables from markdown, HTML, and CSV documents and chunk them while preserving row-column relationships. Designed for RAG pipelines where naive text splitting destroys table semantics.

## Installation

```bash
npm install table-chunk
```

## Why

Standard text splitters treat tables as flat text. When a 40-row markdown table is split at a 512-token boundary, half the rows end up in one chunk without headers, destroying all column context. `table-chunk` ensures every chunk carries its header row so embedding models and LLMs always see complete column context.

## Quick Start

```typescript
import { chunkTable, parseTable, detectTables, serializeRow } from 'table-chunk';

// Chunk a markdown table (auto-detects format)
const chunks = chunkTable(markdownTable, {
  strategy: 'row-based',
  rowsPerChunk: 5,
});

// Each chunk has header context and metadata
for (const chunk of chunks) {
  console.log(chunk.text);       // self-contained table with headers
  console.log(chunk.metadata);   // rowRange, headers, tokenCount, etc.
}
```

## Supported Formats

- **Markdown**: GFM pipe tables with alignment markers, escaped pipes, empty cells
- **HTML**: `<table>` elements with `<thead>`, `<tbody>`, `<tfoot>`, `rowspan`, `colspan`, multi-level headers, `<caption>`
- **CSV/TSV**: RFC 4180 quoting, auto-delimiter detection (comma, tab, semicolon, pipe), auto-header detection

## Chunking Strategies

| Strategy | Best For | Description |
|---|---|---|
| `row-based` (default) | Most tables | Groups N rows per chunk with repeated header row |
| `serialized` | Natural language queries | Converts rows to `"Key: value"` strings |
| `column-based` | Wide tables (20+ columns) | Groups columns with anchor column in every chunk |
| `cell-level` | Lookup tables | One chunk per cell with row/column context |
| `section-based` | Grouped tables | Splits on blank rows or section boundaries |
| `whole-table` | Small tables | Entire table as a single chunk |

## API

### `chunkTable(input, options?)`

Primary entry point. Detects format, parses, chunks, returns `TableChunk[]`.

```typescript
// Row-based with markdown output
const chunks = chunkTable(table, { strategy: 'row-based', rowsPerChunk: 5 });

// Serialized for embedding
const chunks = chunkTable(table, {
  strategy: 'serialized',
  serialization: { format: 'key-value' },
});

// Token-bounded
const chunks = chunkTable(table, {
  strategy: 'row-based',
  maxTokens: 512,
  tokenCounter: (text) => Math.ceil(text.length / 4),
});
```

### `parseTable(input, format?)`

Parse raw table input into a normalized `Table` object without chunking.

```typescript
const table = parseTable(markdownTable);
console.log(table.headers);  // ['Name', 'Age', 'City']
console.log(table.rows[0]);  // ['Alice', '30', 'New York']
```

### `detectTables(document, format?)`

Find all table regions in a mixed-content document.

```typescript
const regions = detectTables(documentContent);
for (const region of regions) {
  const chunks = chunkTable(region.content!, { format: region.format });
}
```

### `serializeRow(row, headers, options?)`

Serialize a single row into an embedding-friendly string.

```typescript
serializeRow(['Alice', '30', 'NY'], ['Name', 'Age', 'City']);
// "Name: Alice, Age: 30, City: NY"

serializeRow(['Alice', '30'], ['Name', 'Age'], { format: 'newline' });
// "Name: Alice\nAge: 30"

serializeRow(row, headers, {
  format: 'template',
  template: '{{Name}} is {{Age}} years old.',
});
// "Alice is 30 years old."
```

### `createTableChunker(config)`

Factory for a reusable configured chunker.

```typescript
const chunker = createTableChunker({
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  maxTokens: 512,
});

for (const tableHtml of tables) {
  const chunks = chunker.chunk(tableHtml);
}
```

## Options

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'auto' \| 'markdown' \| 'html' \| 'csv' \| 'tsv'` | `'auto'` | Source format |
| `strategy` | `ChunkStrategy` | `'row-based'` | Chunking strategy |
| `rowsPerChunk` | `number` | `10` | Rows per chunk (row-based) |
| `maxTokens` | `number` | `undefined` | Token budget per chunk |
| `tokenCounter` | `(text: string) => number` | `chars/4` | Token counting function |
| `outputFormat` | `'markdown' \| 'csv' \| 'tsv' \| 'plain'` | `'markdown'` | Output format for row-based chunks |
| `columnsPerChunk` | `number` | `5` | Columns per chunk (column-based) |
| `anchorColumns` | `number[]` | `[0]` | Columns always included (column-based) |
| `identifierColumn` | `number` | `0` | Row identifier column (cell-level) |
| `sectionColumn` | `number` | `undefined` | Section boundary column (section-based) |
| `hasHeader` | `boolean \| 'auto'` | `'auto'` | Whether first row is header |
| `includeEmptyCells` | `boolean` | `false` | Include empty cells in serialized output |
| `preserveCellHtml` | `boolean` | `false` | Keep HTML tags in cell values |

## Zero Runtime Dependencies

This package has no runtime dependencies. Markdown, HTML, and CSV parsing are all implemented from scratch.

## License

MIT

# table-chunk -- Implementation Tasks

## Phase 1: Project Setup and Scaffolding

- [ ] **Install runtime dependencies** -- Add `htmlparser2@^9.1.0` and `csv-parse@^5.5.0` to `dependencies` in `package.json`. | Status: not_done
- [x] **Install dev dependencies** -- Add `typescript@^5.4.0`, `vitest@^1.6.0`, and `eslint@^9.0.0` to `devDependencies` in `package.json`. Run `npm install`. | Status: done
- [x] **Create directory structure** -- Create `src/parse/`, `src/chunk/`, `test/parse/`, `test/chunk/`, and `test/__snapshots__/` directories matching the spec's file structure (section 20). | Status: done
- [ ] **Add CLI bin entry to package.json** -- Add `"bin": { "table-chunk": "dist/cli.js" }` to `package.json` so the CLI is available after install. | Status: not_done
- [x] **Configure vitest** -- Add a `vitest.config.ts` (or inline config in `package.json`) to set up the test runner with the `test/` directory as the test root. | Status: done
- [x] **Configure ESLint** -- Add a minimal ESLint config file compatible with ESLint v9 and TypeScript. | Status: done

---

## Phase 2: Type Definitions (`src/types.ts`)

- [x] **Define `TableFormat` type** -- `'auto' | 'markdown' | 'html' | 'csv' | 'tsv'` as specified in section 11. | Status: done
- [x] **Define `ChunkStrategy` type** -- `'row-based' | 'serialized' | 'column-based' | 'cell-level' | 'section-based' | 'whole-table'` as specified in section 11. | Status: done
- [x] **Define `RowOutputFormat` type** -- `'markdown' | 'csv' | 'tsv' | 'plain'` as specified in section 11. | Status: done
- [x] **Define `SerializationFormat` type** -- `'key-value' | 'newline' | 'sentence' | 'template'` as specified in section 11. | Status: done
- [x] **Define `TableMetadata` interface** -- Include `format`, `rowCount`, `columnCount`, `inferredHeaders`, `caption?`, `htmlSummary?`, `alignment?`, `hadMergedCells?`, and `originalHeaderLevels?` fields per section 6.1. | Status: done
- [x] **Define `Table` interface** -- Include `headers: string[]`, `rows: string[][]`, and `metadata: TableMetadata` per section 6.1. | Status: done
- [x] **Define `TableChunkMetadata` interface** -- Include all fields: `chunkIndex`, `totalChunks`, `tableIndex`, `rowRange?`, `columnRange?`, `headers`, `sourceFormat`, `strategy`, `serializationFormat?`, `tableRowCount`, `tableColumnCount`, `tokenCount`, `hadMergedCells?`, `oversized?`, `caption?`, `sectionLabel?`, `cellContext?` per section 11. | Status: done
- [x] **Define `TableChunk` interface** -- Include `text: string` and `metadata: TableChunkMetadata` per section 11. | Status: done
- [x] **Define `TableRegion` interface** -- Include `format`, `startLine?`, `endLine?`, `startOffset?`, `endOffset?`, `estimatedRows`, `estimatedColumns`, `content?` per section 11. | Status: done
- [x] **Define `ChunkTableOptions` interface** -- Include all option fields: `format`, `strategy`, `rowsPerChunk`, `columnsPerChunk`, `anchorColumns`, `columnOverlap`, `maxTokens`, `tokenCounter`, `outputFormat`, `serialization`, `sectionColumn`, `identifierColumn`, `hasHeader`, `nestedTables`, `preserveCellHtml`, `tableIndex`, `includeEmptyCells` with defaults documented in JSDoc per section 11. | Status: done
- [x] **Define `SerializeRowOptions` interface** -- Include `format`, `template`, `templateCaseSensitive`, `removeMissingPlaceholders`, `sentenceSubjectColumn`, `includeEmptyCells` per section 11. | Status: done
- [x] **Define `TableChunker` interface** -- Include `chunk(input: string): TableChunk[]`, `parse(input: string): Table`, `chunkTable(table: Table): TableChunk[]` per section 10. | Status: done
- [x] **Ensure types.ts has no imports from other source files** -- All other modules should import from `types.ts`, not the other way around (section 20 constraint). | Status: done

---

## Phase 3: Table Parsing

### 3A: Format Detection (`src/parse/index.ts`)

- [x] **Implement `parseTable()` function** -- Create the main dispatch function `parseTable(input: string, format?: TableFormat): Table` that auto-detects format when `format` is `'auto'` or unset, then delegates to the appropriate parser (section 10). | Status: done
- [x] **Implement format auto-detection logic** -- Check for HTML `<table>` tags first, then markdown pipe-table separators, then fall back to CSV heuristics. The detection order and criteria are specified in sections 5.1, 5.2, 5.3. | Status: done
- [x] **Implement CSV delimiter auto-detection** -- Count occurrences of `,`, `\t`, `;`, and `|` in the first 10 lines. Choose the delimiter with the most consistent per-line count (lowest variance). Fall back to single-column CSV if none is consistent (section 5.3). | Status: done

### 3B: Markdown Table Parser (`src/parse/markdown.ts`)

- [x] **Implement markdown table line splitting** -- Split raw input into lines. Identify header row (line 0), separator row (line 1), and data rows (lines 2+) per section 6.2. | Status: done
- [x] **Implement separator row detection** -- Validate that each cell in the separator row matches `/^:?-+:?$/` after trimming. Extract alignment markers (`:---` = left, `:---:` = center, `---:` = right, `---` = none) per section 6.2. | Status: done
- [x] **Implement pipe splitting with escape handling** -- Split rows on unescaped `|` characters. Convert `\|` to literal `|` in cell values. Strip leading/trailing pipes if present (section 6.2). | Status: done
- [x] **Implement cell trimming and header formatting cleanup** -- Trim whitespace from all cells. Strip inline markdown formatting (`**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `~~strikethrough~~`) from header cells only. Data cells retain formatting (section 6.2). | Status: done
- [x] **Implement column count validation** -- Ensure all rows have the same column count as the header row. Pad short rows with empty strings, truncate long rows (section 6.2). | Status: done
- [x] **Handle tables without outer pipes** -- GFM allows `Name | Age | City` without leading/trailing `|`. Parser must handle both forms (section 5.1). | Status: done
- [x] **Handle empty cells** -- An empty cell between `||` becomes an empty string `""` in the row array (section 6.2). | Status: done
- [ ] **Handle minimum column count** -- Tables must have at least two columns. A single `|` not part of a multi-column pattern is not a table row (section 5.1). | Status: not_done

### 3C: HTML Table Parser (`src/parse/html.ts`)

- [x] **Implement HTML table parsing with htmlparser2** -- Use `htmlparser2` SAX-style parsing to register handlers for `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<th>`, `<td>`, and their closing tags (section 6.3). | Status: done
- [x] **Implement grid construction with cursor tracking** -- Initialize a dynamic 2D grid. Maintain a (row, col) cursor. Advance cursor past pre-filled cells from prior rowspan/colspan expansions before processing each `<th>`/`<td>` (section 6.3). | Status: done
- [x] **Implement colspan expansion** -- When a cell has `colspan > 1`, fill (cursor.row, cursor.col+1) through (cursor.row, cursor.col + colspan - 1) with the same cell value (section 6.3). | Status: done
- [x] **Implement rowspan expansion** -- When a cell has `rowspan > 1`, fill (cursor.row+1, cursor.col) through (cursor.row + rowspan - 1, cursor.col) with the same cell value, including colspan expansions (section 6.3). | Status: done
- [x] **Implement fillGrid map for merged cell tracking** -- Use a `Map<string, string>` keyed by `"row,col"` to track cells pre-filled by rowspan/colspan. Check before placing each cell (section 13). | Status: done
- [x] **Implement header identification** -- Cells from `<thead>` rows or `<th>` elements are header cells. If no `<th>` and no `<thead>`, use first row as headers. If `hasHeader: false`, generate synthetic column names (section 6.3). | Status: done
- [x] **Implement multi-level header flattening** -- When multiple header rows exist (e.g., a `<th>` with `colspan` spanning sub-headers), flatten to qualified names: "Q1 Revenue", "Q1 Cost". Handle 2-level and 3+ level headers recursively. Deduplicate when child text matches parent text (section 8.5). | Status: done
- [x] **Handle repeated-header column name deduplication** -- When two columns have the same flattened name, append numeric suffix: "Revenue (1)", "Revenue (2)" (section 8.5). | Status: done
- [x] **Implement cell text extraction (strip HTML tags)** -- Strip HTML inside cells (bold, italics, links, nested elements) to plain text. Support `preserveCellHtml` option to retain raw HTML (section 6.3). | Status: done
- [x] **Handle `<caption>` extraction** -- Extract `<caption>` text and store in `Table.metadata.caption` (section 5.2). | Status: done
- [x] **Handle `summary` attribute** -- Extract the HTML `summary` attribute from `<table>` and store in `Table.metadata.htmlSummary` (section 5.2). | Status: done
- [x] **Handle `<tfoot>` rows** -- Append footer rows to the data rows array after all body rows (section 6.3). | Status: done
- [ ] **Implement nested table handling** -- Support `nestedTables: 'ignore' | 'extract' | 'flatten'` option. Track nesting depth. Default is `'extract'` (nested tables extracted as independent regions; outer cell treated as empty) (section 5.2). | Status: not_done
- [x] **Set `hadMergedCells` metadata flag** -- Set to `true` when any rowspan/colspan expansion occurred (section 6.1). | Status: done
- [x] **Store `originalHeaderLevels` metadata** -- Record pre-flattening header levels for multi-level headers (section 6.1). | Status: done

### 3D: CSV/TSV Parser (`src/parse/csv.ts`)

- [x] **Implement CSV parsing with csv-parse/sync** -- Use `csv-parse` synchronous API with the configuration specified in section 6.4: `delimiter`, `quote: '"'`, `escape: '"'`, `relax_quotes: true`, `relax_column_count: true`, `trim: true`, `skip_empty_lines: true`. | Status: done
- [x] **Implement header row auto-detection for CSV** -- First row is a header if all values are non-numeric strings, or if `hasHeader` is `true`. If `hasHeader` is `false`, generate synthetic column names ("Column 1", "Column 2", ...) (section 5.3). | Status: done
- [x] **Handle column count normalization** -- Pad rows with fewer cells than header with empty strings. Truncate rows with more cells than header (section 6.4). | Status: done
- [x] **Support RFC 4180 quoting and escaped quotes** -- Doubled quotes inside quoted fields (`""`) are handled by csv-parse config (section 6.4). | Status: done
- [x] **Support multiple delimiters** -- Handle comma, tab, semicolon, and pipe delimiters based on auto-detection or explicit `format` option (section 5.3). | Status: done

---

## Phase 4: Table Serialization (`src/serialize.ts`)

- [x] **Implement `serializeRow()` public function** -- `serializeRow(row: string[], headers: string[], options?: SerializeRowOptions): string`. This is a first-class public API (section 9). | Status: done
- [x] **Implement key-value serialization format** -- Join `header + ": " + value` pairs with `", "`. Skip empty-value pairs when `includeEmptyCells` is false (default). This is the default format (section 9.1). | Status: done
- [x] **Implement newline serialization format** -- One `header: value` per line, separated by `\n` (section 9.2). | Status: done
- [x] **Implement sentence serialization format** -- Use first column value as subject. Construct clauses: `"${header} is ${value}"` for second field, `"${header.toLowerCase()} ${value}"` for subsequent. Join final clause with "and". Fall back to key-value with period for rows where no natural sentence emerges (section 9.3). | Status: done
- [x] **Implement configurable sentence subject column** -- Support `sentenceSubjectColumn` option (default: 0) to select which column is the sentence subject (section 9.3). | Status: done
- [x] **Implement template serialization format** -- Replace `{{Header Name}}` placeholders in template string with cell values. Support case-insensitive matching by default (`templateCaseSensitive` option). Support `removeMissingPlaceholders` option for unmatched placeholders (section 9.4). | Status: done
- [x] **Handle empty cells in serialization** -- When `includeEmptyCells` is false (default), omit fields with empty values. When true, include them (section 8.2). | Status: done

---

## Phase 5: Table Text Reconstruction (`src/format.ts`)

- [x] **Implement markdown output format** -- Reconstruct GFM markdown table from headers and rows, including separator row with dashes (section 7.1). | Status: done
- [x] **Implement CSV output format** -- Reconstruct comma-delimited CSV with header row (section 7.1). | Status: done
- [x] **Implement TSV output format** -- Reconstruct tab-delimited text with header row (section 7.1). | Status: done
- [x] **Implement plain output format** -- Pipe-separated text without markdown separator row (section 7.1). | Status: done

---

## Phase 6: Chunking Strategies

### 6A: Row-Based Chunking (`src/chunk/row-based.ts`)

- [x] **Implement row-based chunking algorithm** -- Slice `rows` array into batches of `rowsPerChunk` (default: 10). Reconstruct table text for each batch using the selected output format. Set `rowRange` metadata as `[startRow, endRow)` (exclusive) (section 7.1). | Status: done
- [x] **Implement header repetition** -- Prepend the full header row (and separator row for markdown format) to every chunk (section 8.1). | Status: done
- [x] **Handle last batch with fewer rows** -- The last chunk may have fewer rows than `rowsPerChunk`. Ensure correct `rowRange` metadata (section 17). | Status: done
- [x] **Handle single-row tables** -- Produce exactly one chunk with one data row (section 17). | Status: done
- [x] **Handle tables smaller than rowsPerChunk** -- Produce a single chunk containing all rows (section 17). | Status: done
- [x] **Support all four output formats** -- Route to `format.ts` to produce markdown, CSV, TSV, or plain text output (section 7.1). | Status: done

### 6B: Serialized Chunking (`src/chunk/serialized.ts`)

- [x] **Implement serialized chunking algorithm** -- For each batch of `rowsPerChunk` rows, call `serializeRow()` for each row and join with `\n\n` (double newline). Each batch becomes one chunk (section 7.2). | Status: done
- [x] **Set serialization metadata** -- Include `serializationFormat` in chunk metadata (section 11). | Status: done
- [x] **Support all four serialization formats** -- Delegate to `serializeRow()` with the configured format from `options.serialization` (section 7.2). | Status: done

### 6C: Column-Based Chunking (`src/chunk/column-based.ts`)

- [x] **Implement column grouping algorithm** -- Divide columns into groups of `columnsPerChunk` (default: 5). For each group, extract header subset and corresponding cell values from every row. Reconstruct mini-table (section 7.3). | Status: done
- [x] **Implement anchor columns** -- Always include columns specified by `anchorColumns` (default: `[0]`) in every chunk (section 7.3). | Status: done
- [x] **Implement column overlap** -- Include `columnOverlap` (default: 1) columns from the previous group at the start of each subsequent group for context continuity (section 7.3). | Status: done
- [x] **Set columnRange metadata** -- Include `columnRange: [startCol, endCol)` in chunk metadata (section 11). | Status: done

### 6D: Cell-Level Chunking (`src/chunk/cell-level.ts`)

- [x] **Implement per-cell chunking algorithm** -- For each data row, for each non-identifier column, emit a chunk with identifier cell value, column name, and cell value. Use template: `"{{identifierHeader}}: {{identifierValue}} | {{columnHeader}}: {{cellValue}}"` (section 7.4). | Status: done
- [x] **Support configurable identifier column** -- Use `identifierColumn` option (default: 0) to select the row identifier column (section 7.4). | Status: done
- [x] **Handle empty identifier column** -- When the identifier column is empty for a row, use the row index as identifier (`"Row 12"`) (section 8.3). | Status: done
- [x] **Set cellContext metadata** -- Include `cellContext: { rowIdentifier, columnName }` in chunk metadata (section 11). | Status: done
- [x] **Produce correct chunk count** -- A table with R rows and C columns produces R x (C - 1) chunks in per-cell mode (section 7.4). | Status: done

### 6E: Section-Based Chunking (`src/chunk/section-based.ts`)

- [x] **Implement blank-row section boundary detection** -- A data row where all cells are empty strings is a section boundary. The blank row is not included in any chunk (section 7.5). | Status: done
- [x] **Implement section header row detection** -- A row where the first cell appears to be a heading (all other cells are empty, or first cell is bold/caps) is treated as a section header, included at the top of its section's chunk (section 7.5). | Status: done
- [x] **Implement sectionColumn-based boundaries** -- When `sectionColumn` is set, start a new section when the value in that column changes between consecutive rows (section 7.5). | Status: done
- [x] **Produce section chunks with headers** -- Each section chunk contains the table header, the optional section header row, and the section's data rows (section 7.5). | Status: done
- [x] **Set sectionLabel metadata** -- Include `sectionLabel` in chunk metadata when a section header row is detected (section 11). | Status: done

### 6F: Whole-Table Chunking (`src/chunk/whole-table.ts`)

- [x] **Implement whole-table chunking** -- Return entire table as a single chunk with `rowRange: [0, table.rows.length]` (section 7.6). | Status: done
- [x] **Implement oversized detection** -- When `maxTokens` is set and the table exceeds it, but `strategy: 'whole-table'` is explicitly requested, set `oversized: true` in metadata. Do not truncate (section 7.6). | Status: done
- [ ] **Implement auto-fallback for row-based** -- When `strategy: 'row-based'` and the whole table fits within `maxTokens`, use whole-table mode automatically (section 7.6). | Status: not_done

### 6G: Chunk Strategy Dispatch (`src/chunk/index.ts`)

- [x] **Implement `chunkTable()` function** -- Create the main entry point `chunkTable(input: string, options?: ChunkTableOptions): TableChunk[]`. Parse the table via `parseTable()`, then dispatch to the appropriate strategy based on `options.strategy` (section 10). | Status: done
- [x] **Apply default options** -- Set defaults for all unspecified options: `format: 'auto'`, `strategy: 'row-based'`, `rowsPerChunk: 10`, `columnsPerChunk: 5`, `anchorColumns: [0]`, `columnOverlap: 1`, `outputFormat: 'markdown'`, `identifierColumn: 0`, `hasHeader: 'auto'`, `nestedTables: 'extract'`, `preserveCellHtml: false`, `tableIndex: 0`, `includeEmptyCells: false` (section 14). | Status: done
- [x] **Implement default token counter** -- `(text) => Math.ceil(text.length / 4)` used when `tokenCounter` is not provided (section 14). | Status: done
- [x] **Populate common metadata fields** -- Set `chunkIndex`, `totalChunks`, `tableIndex`, `headers`, `sourceFormat`, `strategy`, `tableRowCount`, `tableColumnCount`, `tokenCount`, `hadMergedCells`, `caption` on every chunk (section 12). | Status: done

---

## Phase 7: Token-Bounded Chunking

- [x] **Implement token-bounded row batching** -- When `maxTokens` is set, dynamically size row batches for row-based chunking to keep each chunk under the token limit. Use the provided `tokenCounter` (or default `chars/4`) to measure chunk size (section 7.1, 14). | Status: done
- [x] **Handle single-row exceeding maxTokens** -- When a single row plus header exceeds `maxTokens`, emit it as a single chunk (cannot split further) and do not mark as oversized unless whole-table strategy (section 7.6). | Status: done
- [x] **Apply token counting to serialized strategy** -- When `maxTokens` is set for serialized chunking, batch rows dynamically to stay under the limit (section 7.2). | Status: done

---

## Phase 8: Table Detection (`src/detect.ts`)

- [x] **Implement `detectTables()` function** -- `detectTables(document: string, format?: 'auto' | 'markdown' | 'html'): TableRegion[]`. Find all table regions in a mixed-content document (section 10). | Status: done
- [x] **Implement markdown table detection** -- Scan line by line. Identify candidate rows with `|`, separator rows matching `/^:?-+:?$/`, and table regions extending through consecutive pipe-delimited lines (section 5.1). | Status: done
- [x] **Exclude code blocks from markdown detection** -- Lines inside fenced code blocks (between ` ``` ` or `~~~`) are excluded from table detection (section 5.1). | Status: done
- [x] **Handle tables without outer pipes in detection** -- GFM allows `Name | Age | City` without leading/trailing `|`. Detection must handle both forms (section 5.1). | Status: done
- [x] **Implement HTML table detection** -- Scan for `<table` tags (case-insensitive). Track nesting depth for nested tables. Record character offset range (start, end) for each region (section 5.2). | Status: done
- [ ] **Implement CSV detection heuristics** -- When no HTML tags or pipe-table separators are found, use delimiter consistency heuristics on first 10 lines (section 5.3). | Status: not_done
- [x] **Populate TableRegion fields** -- Set `format`, `startLine`/`endLine` (markdown), `startOffset`/`endOffset` (HTML), `estimatedRows`, `estimatedColumns`. Optionally populate `content` when requested (section 11). | Status: done
- [ ] **Support `extractContent` option** -- When true, populate `content` field on each `TableRegion` with the raw table string (section 11). | Status: not_done

---

## Phase 9: Factory (`src/factory.ts`)

- [x] **Implement `createTableChunker()` factory** -- `createTableChunker(config: ChunkTableOptions): TableChunker`. Return an object with `chunk(input)`, `parse(input)`, and `chunkTable(table)` methods that use the frozen config (section 10). | Status: done
- [ ] **Amortize option parsing** -- Parse and validate options once at factory creation time, not on every call (section 10). | Status: not_done
- [x] **Implement `chunker.chunk(input)`** -- Parse input and then chunk it using the pre-configured options (section 10). | Status: done
- [x] **Implement `chunker.parse(input)`** -- Parse input into a `Table` using pre-configured format detection (section 10). | Status: done
- [x] **Implement `chunker.chunkTable(table)`** -- Chunk a pre-parsed `Table` object using pre-configured strategy and options. Useful for `doc-table-extract` integration where data is already structured (section 15). | Status: done

---

## Phase 10: Public API Exports (`src/index.ts`)

- [x] **Export all public functions** -- Export `chunkTable`, `parseTable`, `detectTables`, `serializeRow`, and `createTableChunker` from `src/index.ts` (section 10). | Status: done
- [x] **Export all public types** -- Export `Table`, `TableMetadata`, `TableChunk`, `TableChunkMetadata`, `TableRegion`, `ChunkTableOptions`, `SerializeRowOptions`, `TableChunker`, `TableFormat`, `ChunkStrategy`, `RowOutputFormat`, `SerializationFormat` from `src/index.ts` (section 10, 11). | Status: done

---

## Phase 11: CLI (`src/cli.ts`)

- [ ] **Implement CLI argument parsing** -- Parse all CLI flags: `-f/--format`, `-s/--strategy`, `-r/--rows-per-chunk`, `-c/--columns-per-chunk`, `--max-tokens`, `--serialization`, `--template`, `--output-format`, `--table-index`, `--no-header`, `--include-empty-cells`, `--detect`, `-o/--output`, `--pretty`, `-h/--help`, `--version` (section 16). | Status: not_done
- [ ] **Implement file input reading** -- Read from file path argument if provided, otherwise read from stdin (section 16). | Status: not_done
- [ ] **Implement `--detect` mode** -- When `--detect` is passed, call `detectTables()` and output `TableRegion[]` as JSON instead of chunking (section 16). | Status: not_done
- [ ] **Implement default chunking mode** -- Call `chunkTable()` with parsed options and write `TableChunk[]` as JSON to stdout (or to file if `-o` specified) (section 16). | Status: not_done
- [ ] **Implement `--pretty` flag** -- Pretty-print JSON output with indentation when flag is set (section 16). | Status: not_done
- [ ] **Implement `-h/--help` flag** -- Show help text with all options and example usage (section 16). | Status: not_done
- [ ] **Implement `--version` flag** -- Read and display version from `package.json` (section 16). | Status: not_done
- [ ] **Implement exit codes** -- Exit 0 on success, 1 on parse error, 2 on configuration error, 3 on file not found (section 16). | Status: not_done
- [ ] **Add hashbang line** -- Add `#!/usr/bin/env node` at the top of `cli.ts` so it is executable (section 16). | Status: not_done

---

## Phase 12: Unit Tests -- Parsers

### 12A: Markdown Parser Tests (`test/parse/markdown.test.ts`)

- [x] **Test standard well-formed markdown table** -- Verify headers, rows, metadata for a basic pipe table with outer pipes (section 17). | Status: done
- [x] **Test markdown table without outer pipes** -- Verify parsing of `Name | Age | City` format without leading/trailing `|` (section 5.1). | Status: done
- [x] **Test escaped pipes in cells** -- Verify `\|` is converted to literal `|` in cell values (section 6.2). | Status: done
- [x] **Test alignment marker extraction** -- Verify `:---`, `:---:`, `---:`, `---` produce correct `alignment` metadata (section 6.2). | Status: done
- [x] **Test empty cells** -- Verify `||` produces empty string `""` in the row array (section 6.2). | Status: done
- [x] **Test column count normalization** -- Verify short rows are padded and long rows are truncated (section 6.2). | Status: done
- [x] **Test header formatting cleanup** -- Verify `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `~~strikethrough~~` are stripped from headers but retained in data cells (section 6.2). | Status: done
- [x] **Test single-row table** -- Verify a table with one header and one data row parses correctly (section 17). | Status: done
- [x] **Test table with many rows** -- Verify correct parsing of a table with 50+ rows (section 17). | Status: done

### 12B: HTML Parser Tests (`test/parse/html.test.ts`)

- [x] **Test standard HTML table with thead/tbody** -- Verify headers from `<th>` elements and rows from `<td>` elements (section 17). | Status: done
- [x] **Test HTML table with colspan** -- Verify grid expansion produces correct rectangular matrix (section 17). | Status: done
- [x] **Test HTML table with rowspan** -- Verify grid expansion produces correct rectangular matrix (section 17). | Status: done
- [x] **Test HTML table with combined rowspan and colspan** -- Verify correct expansion when a single cell has both attributes (section 17). | Status: done
- [x] **Test multi-level headers** -- Verify two-level headers are flattened to qualified names ("Q1 Revenue", "Q1 Cost") (section 17). | Status: done
- [ ] **Test three-level headers** -- Verify recursive flattening for 3+ header rows (section 8.5). | Status: not_done
- [ ] **Test duplicate flattened header names** -- Verify numeric suffix appended: "Revenue (1)", "Revenue (2)" (section 8.5). | Status: not_done
- [x] **Test table without `<th>` or `<thead>`** -- Verify first row used as headers, or synthetic names if `hasHeader: false` (section 6.3). | Status: done
- [x] **Test `<caption>` extraction** -- Verify caption text stored in metadata (section 5.2). | Status: done
- [x] **Test `summary` attribute extraction** -- Verify summary stored in metadata (section 5.2). | Status: done
- [x] **Test `<tfoot>` rows** -- Verify footer rows appended after body rows (section 6.3). | Status: done
- [ ] **Test nested tables (extract mode)** -- Verify nested table returned as separate region, outer cell treated as empty (section 5.2). | Status: not_done
- [ ] **Test nested tables (ignore mode)** -- Verify nested table skipped, outer cell treated as empty (section 5.2). | Status: not_done
- [ ] **Test nested tables (flatten mode)** -- Verify nested table content included as string in the cell (section 5.2). | Status: not_done
- [ ] **Test `preserveCellHtml` option** -- Verify raw HTML retained in cell values when enabled (section 6.3). | Status: not_done
- [ ] **Test malformed HTML table** -- Verify best-effort output without throwing (section 17). | Status: not_done
- [x] **Test `hadMergedCells` metadata flag** -- Verify set to `true` when rowspan/colspan expansion occurs (section 13). | Status: done

### 12C: CSV Parser Tests (`test/parse/csv.test.ts`)

- [x] **Test standard comma-delimited CSV** -- Verify correct headers and rows (section 17). | Status: done
- [x] **Test tab-delimited TSV** -- Verify correct parsing with `\t` delimiter (section 17). | Status: done
- [x] **Test semicolon-delimited CSV** -- Verify correct parsing with `;` delimiter (section 17). | Status: done
- [ ] **Test pipe-delimited CSV** -- Verify correct parsing with `|` delimiter (section 17). | Status: not_done
- [x] **Test RFC 4180 quoted fields** -- Verify quoted fields with commas inside are handled correctly (section 17). | Status: done
- [x] **Test escaped quotes (doubled)** -- Verify `""` inside quoted fields produces single `"` (section 17). | Status: done
- [x] **Test Windows line endings** -- Verify `\r\n` line endings are handled (section 17). | Status: done
- [ ] **Test trailing commas** -- Verify trailing delimiter handling (section 17). | Status: not_done
- [ ] **Test no-header CSV** -- Verify synthetic column names ("Column 1", "Column 2", ...) generated when `hasHeader: false` (section 17). | Status: not_done
- [x] **Test auto-detection of header row** -- Verify first row detected as header when all values are non-numeric strings (section 5.3). | Status: done
- [x] **Test inconsistent column counts** -- Verify short rows padded, long rows truncated (section 6.4). | Status: done
- [x] **Test CSV delimiter auto-detection** -- Verify correct delimiter chosen based on consistency heuristic across first 10 lines (section 5.3). | Status: done

---

## Phase 13: Unit Tests -- Serialization (`test/serialize.test.ts`)

- [x] **Test key-value format** -- Verify `"Name: Alice, Age: 30, City: New York"` output (section 9.1). | Status: done
- [x] **Test newline format** -- Verify one `Header: Value` per line output (section 9.2). | Status: done
- [x] **Test sentence format** -- Verify natural language sentence with first column as subject (section 9.3). | Status: done
- [x] **Test sentence format fallback** -- Verify fallback to key-value with period when no natural sentence is possible (section 9.3). | Status: done
- [x] **Test sentence format with custom subject column** -- Verify `sentenceSubjectColumn` option changes the subject (section 9.3). | Status: done
- [x] **Test template format with matching placeholders** -- Verify `{{Header}}` placeholders replaced with cell values (section 9.4). | Status: done
- [x] **Test template format with unmatched placeholders** -- Verify unmatched placeholders left as-is by default, removed when `removeMissingPlaceholders: true` (section 9.4). | Status: done
- [x] **Test template format case-insensitive matching** -- Verify `{{name}}` matches header `"Name"` by default (section 9.4). | Status: done
- [x] **Test template format case-sensitive matching** -- Verify `{{name}}` does NOT match `"Name"` when `templateCaseSensitive: true` (section 9.4). | Status: done
- [x] **Test empty cells omitted by default** -- Verify empty-value pairs are skipped when `includeEmptyCells: false` (section 8.2). | Status: done
- [x] **Test empty cells included when configured** -- Verify empty-value pairs are included when `includeEmptyCells: true` (section 8.2). | Status: done

---

## Phase 14: Unit Tests -- Chunking Strategies

### 14A: Row-Based Strategy Tests (`test/chunk/row-based.test.ts`)

- [ ] **Test exact-multiple row count** -- Verify correct number of chunks when rows divide evenly by `rowsPerChunk` (section 17). | Status: not_done
- [x] **Test non-multiple row count** -- Verify last chunk has fewer rows and correct `rowRange` (section 17). | Status: done
- [ ] **Test small table (fewer rows than rowsPerChunk)** -- Verify single chunk produced (section 17). | Status: not_done
- [ ] **Test single-row table** -- Verify one chunk with one data row (section 17). | Status: not_done
- [x] **Test header repetition in every chunk** -- Verify every chunk starts with the header row (section 17). | Status: done
- [x] **Test markdown output format** -- Verify header + separator + data rows in markdown format (section 7.1). | Status: done
- [x] **Test CSV output format** -- Verify comma-delimited output (section 7.1). | Status: done
- [x] **Test TSV output format** -- Verify tab-delimited output (section 7.1). | Status: done
- [x] **Test plain output format** -- Verify pipe-separated without separator row (section 7.1). | Status: done
- [x] **Test token-bounded batching** -- With a mocked token counter, verify row batches sized to stay under `maxTokens` (section 17). | Status: done

### 14B: Serialized Strategy Tests (`test/chunk/serialized.test.ts`)

- [x] **Test single-row-per-chunk serialized output** -- Verify each chunk contains one serialized row (section 7.2). | Status: done
- [x] **Test multi-row batch serialized output** -- Verify rows joined with `\n\n` within a chunk (section 9.5). | Status: done
- [x] **Test key-value serialization in chunks** -- Verify chunks use key-value format (section 7.2). | Status: done
- [x] **Test sentence serialization in chunks** -- Verify chunks use sentence format (section 7.2). | Status: done
- [ ] **Test template serialization in chunks** -- Verify chunks use custom template (section 7.2). | Status: not_done
- [x] **Test serializationFormat metadata** -- Verify `serializationFormat` is set in chunk metadata (section 11). | Status: done

### 14C: Column-Based Strategy Tests (`test/chunk/column-based.test.ts`)

- [x] **Test basic column grouping** -- Verify columns divided into correct groups (section 7.3). | Status: done
- [x] **Test anchor column presence** -- Verify anchor column appears in every chunk (section 7.3). | Status: done
- [ ] **Test column overlap** -- Verify overlapping columns from previous group appear at start of each subsequent group (section 7.3). | Status: not_done
- [x] **Test columnRange metadata** -- Verify `columnRange` is set correctly on each chunk (section 11). | Status: done
- [x] **Test all rows included in each column chunk** -- Verify each chunk contains all data rows (only column subset varies) (section 7.3). | Status: done

### 14D: Cell-Level Strategy Tests (`test/chunk/cell-level.test.ts`)

- [x] **Test correct chunk count** -- Verify R x (C - 1) chunks for R rows and C columns (section 17). | Status: done
- [x] **Test cellContext metadata** -- Verify `cellContext.rowIdentifier` and `cellContext.columnName` set correctly (section 17). | Status: done
- [ ] **Test custom identifier column** -- Verify `identifierColumn` option selects the correct column (section 7.4). | Status: not_done
- [x] **Test empty identifier fallback** -- Verify row index used as identifier when identifier column is empty (section 8.3). | Status: done
- [x] **Test chunk text format** -- Verify chunk text matches `"{{identifierHeader}}: {{identifierValue}} | {{columnHeader}}: {{cellValue}}"` (section 7.4). | Status: done

### 14E: Section-Based Strategy Tests (`test/chunk/section-based.test.ts`)

- [x] **Test blank-row section boundaries** -- Verify sections split at blank rows and blank rows excluded from chunks (section 17). | Status: done
- [x] **Test sectionColumn-based boundaries** -- Verify sections split when value in `sectionColumn` changes (section 17). | Status: done
- [x] **Test section header row detection** -- Verify section header rows included at top of their section's chunk (section 7.5). | Status: done
- [x] **Test sectionLabel metadata** -- Verify `sectionLabel` set in metadata when section header detected (section 11). | Status: done
- [x] **Test table headers in every section chunk** -- Verify each section chunk includes the full table header row (section 7.5). | Status: done

---

## Phase 15: Unit Tests -- Detection (`test/detect.test.ts`)

- [x] **Test markdown table detection in mixed document** -- Verify correct `startLine`, `endLine`, `estimatedRows`, `estimatedColumns` for markdown tables in a document with prose (section 17). | Status: done
- [x] **Test multiple markdown tables detected** -- Verify all table regions found in a document with multiple tables (section 5.4). | Status: done
- [x] **Test code block exclusion** -- Verify pipe characters inside fenced code blocks are not detected as tables (section 5.1). | Status: done
- [x] **Test HTML table detection** -- Verify correct `startOffset`, `endOffset` for `<table>` elements (section 5.2). | Status: done
- [x] **Test nested HTML table detection** -- Verify nested tables produce separate regions (section 5.2). | Status: done
- [ ] **Test CSV detection heuristics** -- Verify auto-detection distinguishes CSV from other formats (section 5.3). | Status: not_done
- [x] **Test content extraction option** -- Verify `content` field populated when `extractContent: true` (section 11). | Status: done

---

## Phase 16: Unit Tests -- Merged Cells (`test/parse/html.test.ts` additions)

- [ ] **Test single rowspan=3 expansion** -- Verify correct grid with value duplicated across 3 rows (section 17). | Status: not_done
- [x] **Test single colspan=2 expansion** -- Verify correct grid with value duplicated across 2 columns (section 17). | Status: done
- [x] **Test combined rowspan and colspan on same cell** -- Verify rectangular region filled correctly (section 17). | Status: done
- [x] **Test multi-level headers with colspan** -- Verify flattened column names are correct (section 17). | Status: done
- [ ] **Test nested table returned as separate region** -- Verify extraction of nested tables as independent regions (section 17). | Status: not_done

---

## Phase 17: Integration Tests (`test/integration.test.ts`)

- [x] **Test full pipeline: markdown -> row-based chunks** -- Verify format detection, parsing, chunking, and metadata correctness for a markdown table (section 17). | Status: done
- [x] **Test full pipeline: HTML with merged cells -> serialized chunks** -- Verify rowspan/colspan normalization and serialized output (section 17). | Status: done
- [x] **Test full pipeline: CSV -> row-based chunks** -- Verify delimiter detection, header detection, and chunking (section 17). | Status: done
- [x] **Test detectTables on mixed document** -- Verify correct regions returned for multiple tables in a document with prose (section 17). | Status: done
- [x] **Test createTableChunker factory** -- Verify multiple tables chunked with the same config produce correct independent outputs (section 17). | Status: done
- [ ] **Test chunkTable with tableIndex option** -- Verify selecting a specific table from a multi-table document (section 14). | Status: not_done
- [ ] **Test whole-table auto-fallback** -- Verify row-based strategy returns a single chunk when table fits under `maxTokens` (section 7.6). | Status: not_done
- [x] **Test oversized whole-table metadata** -- Verify `oversized: true` set when whole-table strategy is explicit and table exceeds `maxTokens` (section 7.6). | Status: done

---

## Phase 18: Snapshot Tests (`test/__snapshots__/`)

- [ ] **Create snapshot tests for row-based markdown output** -- Snapshot representative markdown table chunked with row-based strategy (section 17). | Status: not_done
- [ ] **Create snapshot tests for serialized key-value output** -- Snapshot representative table with serialized key-value format (section 17). | Status: not_done
- [ ] **Create snapshot tests for serialized sentence output** -- Snapshot representative table with serialized sentence format (section 17). | Status: not_done
- [ ] **Create snapshot tests for column-based output** -- Snapshot representative wide table with column-based strategy (section 17). | Status: not_done
- [ ] **Create snapshot tests for cell-level output** -- Snapshot representative table with cell-level strategy (section 17). | Status: not_done
- [ ] **Create snapshot tests for section-based output** -- Snapshot representative table with section boundaries (section 17). | Status: not_done
- [ ] **Create snapshot tests for HTML merged cell output** -- Snapshot HTML table with rowspan/colspan after normalization (section 17). | Status: not_done

---

## Phase 19: Performance Benchmarks

- [ ] **Benchmark 1000-row CSV with row-based strategy** -- Use `vitest bench` to measure parse + chunk time. Ensure under performance regression threshold (section 17). | Status: not_done
- [ ] **Benchmark 500-row HTML table with merged cells and serialized strategy** -- Measure parse (including grid expansion) + chunk time (section 17). | Status: not_done
- [ ] **Benchmark 200-row markdown table with column-based strategy** -- Measure parse + chunk time (section 17). | Status: not_done
- [ ] **Verify parsing performance targets** -- Markdown 1000-row in <5ms, HTML 500-row in <20ms, CSV 10000-row in <50ms (section 18). | Status: not_done

---

## Phase 20: Error Handling and Edge Cases

- [ ] **Handle empty input string** -- `chunkTable("")` should return an empty array or throw a descriptive error. `parseTable("")` should throw or return an empty table. Decide behavior and implement consistently. | Status: not_done
- [ ] **Handle input with no detectable table** -- When auto-detection fails to find any table format, throw a descriptive error (exit code 1 in CLI) (section 16). | Status: not_done
- [ ] **Handle malformed markdown tables** -- Best-effort parsing of markdown tables with wrong pipe counts. Produce output with metadata flags rather than throwing (section 17). | Status: not_done
- [ ] **Handle malformed/truncated HTML tables** -- Best-effort parsing of incomplete HTML. Produce output rather than throwing (section 17). | Status: not_done
- [x] **Handle CSV with inconsistent column counts** -- Pad/truncate rows to match header count (section 6.4). | Status: done
- [ ] **Validate ChunkTableOptions** -- Reject invalid option combinations: e.g., `strategy: 'serialized'` with `outputFormat` (only for row-based), `template` required when `serialization.format: 'template'`. Exit code 2 in CLI (section 16). | Status: not_done
- [ ] **Handle zero-row tables** -- A table with headers but no data rows should produce zero chunks (section 17). | Status: not_done
- [x] **Ensure metadata is always JSON-serializable** -- No functions, no circular references, no class instances in metadata. `JSON.stringify(chunk.metadata)` must always work (section 12). | Status: done

---

## Phase 21: Documentation

- [ ] **Create README.md** -- Write README with: package description, installation, quick start examples, API reference for all 5 public functions, CLI usage, configuration options table, integration examples with chunk-smart and rag-prompt-builder (sections 10, 15, 16). | Status: not_done
- [x] **Add JSDoc comments to all public functions** -- Document parameters, return types, defaults, and usage examples in JSDoc for `chunkTable`, `parseTable`, `detectTables`, `serializeRow`, `createTableChunker` (section 10). | Status: done
- [x] **Add JSDoc comments to all public interfaces** -- Document every field on `Table`, `TableMetadata`, `TableChunk`, `TableChunkMetadata`, `TableRegion`, `ChunkTableOptions`, `SerializeRowOptions`, `TableChunker` (section 11). | Status: done
- [ ] **Document integration patterns** -- Include code examples for integration with `chunk-smart`, `md-to-data`, `doc-table-extract`, and `rag-prompt-builder` (section 15). | Status: not_done

---

## Phase 22: Build and Publish Preparation

- [x] **Verify TypeScript compilation** -- Run `npm run build` and confirm all files compile to `dist/` with `.js`, `.d.ts`, and `.js.map` outputs (section 20). | Status: done
- [ ] **Verify package.json fields** -- Confirm `main`, `types`, `files`, `bin`, `engines`, `publishConfig` are all set correctly (section 10, 20). | Status: not_done
- [x] **Run full test suite** -- `npm run test` must pass all unit, integration, and snapshot tests (section 17). | Status: done
- [x] **Run linter** -- `npm run lint` must pass with zero errors (section 19). | Status: done
- [ ] **Version bump** -- Bump version in `package.json` according to semver for the release (monorepo CLAUDE.md rule). | Status: not_done
- [ ] **Verify CLI works end-to-end** -- Test `table-chunk` CLI with file input, stdin, all strategies, `--detect` mode, `--pretty`, error exit codes (section 16). | Status: not_done

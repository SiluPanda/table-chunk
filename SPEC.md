# table-chunk -- Specification

## 1. Overview

`table-chunk` is a format-aware table extraction and chunking library that finds tables in markdown, HTML, and CSV/TSV documents, parses them into a normalized internal representation, and produces embedding-optimized chunks while preserving row-column relationships. It accepts raw document text or isolated table strings, detects and extracts every table present, normalizes each table into a structured `Table` object with typed headers and rows, and applies a configurable chunking strategy to produce `TableChunk` objects that carry the chunk text, row range, column range, header context, serialization format, and source metadata.

The gap this package fills is specific and well-defined. Tables are the single most common content type to break RAG chunkers. A standard recursive character splitter -- including LangChain's `MarkdownTextSplitter`, `RecursiveCharacterTextSplitter`, and `HTMLSectionSplitter` -- treats table markup as flat text. When a 40-row markdown table is ingested into a 512-token chunk window, the splitter cuts it somewhere in the middle: half the data rows appear in one chunk without headers, the other half appear in the next chunk. The embedded vectors encode rows stripped of all column context. A retrieval query for "what was Alice's order total?" returns a chunk containing `| Alice | 847.50 | ... |` with no column headers -- the embedding model had no idea that "847.50" refers to an order total, and neither does the LLM that receives it. Row-column relationships, which are the entire semantic content of a table, are silently destroyed.

The standard tools in the JavaScript ecosystem do not solve this problem. `csv-parse` parses CSV into arrays but performs no chunking. `cheerio` and `htmlparser2` can extract HTML table cells but provide no row-column-aware chunking logic. The npm packages `csv-splitter` and `chunk-text` operate on character sequences with no knowledge of table structure. LangChain's Python `TableTransformer` converts HTML tables to markdown but does not chunk them for RAG. The `@langchain/textsplitters` JavaScript package treats markdown tables as atomic units within `chunk-smart` but provides no mechanism for tables that are too large to be atomic -- a 200-row HTML table in a product catalog must be chunked, and every chunk must carry the header row. `doc-table-extract` in this monorepo extracts tables from PDF pages and scanned images using computer vision; it does not chunk already-extracted table content for RAG ingestion.

`table-chunk` fills this gap with a three-stage pipeline. Stage one: detect and extract every table in a document, supporting GFM pipe tables, HTML `<table>` elements (including `rowspan`/`colspan`), and CSV/TSV files. Stage two: normalize the extracted table into a `Table` object with a consistent `headers: string[]` + `rows: string[][]` representation regardless of source format, expanding merged cells and resolving multi-level headers. Stage three: apply the configured chunking strategy -- row-based, serialized, column-based, cell-level, section-based, or whole-table -- to produce `TableChunk` objects where every chunk carries the headers it needs to be semantically self-contained.

The package provides a TypeScript/JavaScript API and a CLI. The API is stateless: every function takes input and options, returns a result, makes no network calls, and has no side effects. The CLI reads from stdin or a file and outputs JSON. Both interfaces support format auto-detection, configurable row batch sizes, all serialization formats, and pluggable token counters for size-bounded chunking. Runtime dependencies are minimal: `htmlparser2` for HTML table parsing and `csv-parse` for CSV/TSV parsing. Markdown table parsing is implemented with hand-written scanners and zero additional dependencies.

---

## 2. Goals and Non-Goals

### Goals

- Provide `chunkTable(input, options?)` as the primary entry point: detect format, parse the table, chunk it, and return `TableChunk[]`.
- Provide `parseTable(input, format?)` to normalize any supported format into a `Table` object without chunking.
- Provide `detectTables(document)` to find all table regions in a mixed-content document, returning their positions and formats.
- Support three source formats: GFM markdown pipe tables, HTML `<table>` elements, and CSV/TSV delimited text.
- Implement six chunking strategies: row-based (default), serialized, column-based, cell-level, section-based, and whole-table.
- Preserve header context in every chunk: row-based chunks repeat the header row, serialized chunks embed headers into natural language, cell-level chunks inject column names into every cell string.
- Expand HTML `rowspan` and `colspan` merged cells into an explicit two-dimensional grid before chunking, so no downstream code ever encounters holes in the data.
- Detect and handle multi-level HTML headers (stacked `<th>` rows above the data) by flattening them into qualified column names.
- Auto-detect CSV delimiter (comma, tab, semicolon, pipe) and honor RFC 4180 quoting and escape rules.
- Attach rich metadata to every `TableChunk`: table index within document, row range (zero-indexed data rows), column range, original header list, source format, total table dimensions, and serialization format used.
- Provide `serializeRow(row, headers, options?)` as a standalone utility for building embedding-friendly row strings.
- Provide `createTableChunker(config)` as a factory for a configured chunker instance that amortizes option parsing across many calls.
- Support token-bounded chunking: when `maxTokens` is set and a token counter is provided, row batches are sized to keep chunks under the limit rather than using a fixed row count.
- Provide a CLI (`table-chunk`) that reads table content from stdin or a file and writes `TableChunk[]` as JSON to stdout.
- Apply only deterministic, rule-based logic. No LLM calls, no network access, no non-determinism. The same input with the same options always produces the same output.
- Keep dependencies minimal: `htmlparser2` for HTML, `csv-parse` for CSV, zero dependencies for markdown.
- Target Node.js 18 and above.

### Non-Goals

- **Not a general document chunker.** `table-chunk` handles tables only. For chunking prose, code, JSON, and mixed documents, use `chunk-smart`. The canonical integration is `chunk-smart` for the document, `table-chunk` for its tables.
- **Not a table extractor from PDFs or images.** `doc-table-extract` extracts tables from PDFs and scanned images using computer vision. `table-chunk` consumes already-extracted text-based table content.
- **Not a table renderer.** This package does not render tables back to HTML, markdown, or any display format. It consumes table markup and produces chunks.
- **Not a markdown parser.** Table detection and parsing uses targeted scanners, not a full CommonMark/GFM AST. For full markdown AST parsing, use `remark` or `markdown-it`.
- **Not an HTML parser.** HTML table parsing uses `htmlparser2` for robustness on real-world HTML but does not implement a full HTML5 parser or DOM API.
- **Not a CSV validator.** This package parses CSV to extract table structure for chunking. It does not validate CSV against a schema, detect data quality issues, or report malformed CSV beyond what is needed to produce valid chunks.
- **Not a data transformation library.** This package produces text chunks ready for embedding. It does not aggregate, pivot, filter, or otherwise transform table data. For tabular data processing, use `papaparse`, `arquero`, or `danfo.js`.
- **Not an embedding generator.** This package produces chunk strings. Generating embeddings from those strings is the caller's responsibility. For embedding caching and generation, use `embed-cache` in this monorepo.
- **Not a tokenizer.** Token counting is pluggable. The default counter approximates 1 token per 4 characters. For exact counts, the caller provides a token counter function wrapping `tiktoken`, `gpt-tokenizer`, or any provider tokenizer.
- **Not a LangChain integration.** This package is framework-independent. Wrapping `TableChunk` objects into LangChain `Document` objects is trivial and left to the caller.

---

## 3. Target Users and Use Cases

### RAG Pipeline Builders

Developers constructing retrieval-augmented generation pipelines that ingest structured documents -- financial reports, product catalogs, API reference documentation, research datasets. Their documents contain tables, and naive chunking destroys table semantics. A pipeline that ingests a quarterly earnings report with 15 financial tables needs each row chunked with its header context intact, so that a query for "Q3 operating income" retrieves a chunk that contains both the header row and the relevant data row, with full column names readable by the embedding model.

A typical integration in this pipeline:

```typescript
const chunks = chunkTable(tableMarkdown, { strategy: 'serialized', maxTokens: 512 });
for (const chunk of chunks) {
  await vectorStore.insert({ content: chunk.text, metadata: chunk.metadata });
}
```

### Document Ingestion Systems

Teams building knowledge bases that ingest heterogeneous document collections: technical documentation (markdown, HTML), spreadsheet exports (CSV, TSV), and web scrapes (HTML). The documents contain tables of varying sizes -- some small enough to embed whole, others spanning hundreds of rows. `table-chunk` handles the table-specific pipeline while `chunk-smart` handles prose sections. Together they cover the full document.

### Enterprise Data Extraction

Data engineering teams that extract structured content from corporate documents: pricing tables, specification matrices, comparison tables, bill-of-materials, financial schedules. The extracted row data needs to be searchable by any column value, which requires that each chunk carry the full column header context. The serialized chunking strategy ("Product: Widget A, SKU: W-001, Price: $49.99, Stock: 240") produces natural-language chunks that embed with higher relevance than raw pipe-delimited rows.

### API Documentation Indexing

Developer tools teams building semantic search over API documentation. API docs are dense with tables: parameter tables, response field tables, error code tables, configuration option tables. Each row in a parameter table describes one parameter -- name, type, required/optional, description, default value. For a query like "what parameters does the create-user endpoint accept?", the ideal retrieved chunk is a batch of rows from that table, each row serialized with its column names, not a raw markdown fragment.

### Research Data Tables

Academic teams and data scientists who need to make research datasets searchable via natural language queries. A 500-row CSV of experimental results needs to be chunked so that each chunk is a coherent group of rows with column context, and the serialized format makes each row's values searchable as text. `table-chunk` accepts the CSV directly and produces embedding-ready chunks without requiring manual conversion.

### Multi-Format Document Pipelines

Teams whose documents arrive in mixed formats: some tables are in markdown (documentation), some in HTML (web scrapes), some in CSV (data exports). `table-chunk`'s format auto-detection handles all three without format-specific preprocessing. The output `TableChunk` objects carry a `sourceFormat` field so the caller knows where each chunk originated.

---

## 4. Core Concepts

### Table

A table is a two-dimensional data structure with an optional header row and zero or more data rows, where each row contains the same number of cells. In `table-chunk`, a parsed table is always represented as a `Table` object with a `headers` string array and a `rows` string[][] matrix. This representation is format-independent: the same `Table` type represents a parsed markdown table, a parsed HTML table, and a parsed CSV file. All source-format-specific details (pipe characters, HTML tags, delimiter characters) are removed during parsing. Cell values are always strings; type inference is not performed (unlike `md-to-data`, which is focused on data extraction rather than RAG chunking).

### Headers

Headers are the column names for a table. They give each column its semantic identity. A row value without its header is ambiguous: the string `"847.50"` means nothing without knowing its column is "Total Order Amount". In RAG chunking, headers are the most critical piece of context because they are what allow an embedding model to understand what a cell value means.

`table-chunk` tracks header context through every stage:

- **Row-based chunking**: The header row is prepended to every chunk, so each chunk is a self-contained mini-table with its own header row.
- **Serialized chunking**: Headers are embedded into the serialized text directly: `"Column Name: cell value"`.
- **Cell-level chunking**: Each cell string includes both row context and column context.
- **Column-based chunking**: Chunks contain only selected columns, but each chunk still begins with the headers for those columns.

When a table has no detected header row (CSV with no header, HTML table with no `<th>` elements), `table-chunk` generates synthetic column names: `Column 1`, `Column 2`, etc., and marks the table with `inferredHeaders: true` in its metadata.

### Rows

A data row is one record in the table -- a complete set of column values for a single entity, event, or observation. Rows are the natural unit of table data. A product row contains all the data about one product. An employee row contains all the data about one employee. A transaction row contains all the data about one transaction.

Chunking at row boundaries is the correct granularity for most RAG use cases: each chunk should contain whole rows, and each row should contain all its values. Splitting mid-row (as naive character splitters do) destroys the row's coherence. Omitting the header row from a chunk loses the column semantics.

### Chunk

A table chunk is a piece of table content prepared for embedding and retrieval. A chunk is always a plain string (the `text` field of `TableChunk`) that is semantically self-contained: a reader -- or an embedding model -- can understand the content without any surrounding context. This self-containment is achieved through header repetition, header injection, or row serialization, depending on the strategy.

A chunk carries `metadata` that describes its origin and structure: which table it came from, which rows it covers, which columns it covers, the source format, the strategy used, and the original table dimensions. This metadata enables the caller to reconstruct context, filter by table, and understand the chunk's place within the source document.

### Serialization

Serialization is the process of converting tabular data (rows and columns) into natural language text. Raw table markup is a poor embedding target because embedding models are trained primarily on natural language. A markdown row like `| Alice | 30 | New York |` is syntactically noisy. A serialized version `"Name: Alice, Age: 30, City: New York"` or `"Alice is 30 years old and lives in New York"` produces embeddings that align better with natural language queries.

`table-chunk` provides three built-in serialization formats and supports custom templates:

- **key-value** (default): `"Name: Alice, Age: 30, City: New York"`
- **sentence**: `"Alice is 30 years old and lives in New York"` (best effort natural language, using commas as separator for non-trivially-sentenceable rows)
- **newline**: `"Name: Alice\nAge: 30\nCity: New York"` (one field per line, better for models that process structured prompts)

### Chunk Strategy

A chunk strategy is the algorithm for deciding how rows are grouped and how each group's content is formatted. The choice of strategy depends on the table's purpose, its size, and how it will be queried:

| Strategy | Best For | Output Format |
|---|---|---|
| `row-based` | Most tables; balanced size and context | Mini-table with repeated header row |
| `serialized` | Tables queried via natural language | One natural language string per row or per batch |
| `column-based` | Wide tables (20+ columns) where queries target column subsets | Mini-table with column subset, full column headers |
| `cell-level` | Lookup tables where each cell is independently queryable | One string per cell with row and column injection |
| `section-based` | Tables with blank-row sections or sub-group markers | Groups by section, with section label |
| `whole-table` | Small tables that fit under token budget | Entire table as single chunk |

### Header Preservation

Header preservation is the principle that every chunk must contain enough column context for its data to be semantically interpretable. This is the defining invariant of `table-chunk` and is what distinguishes it from naive chunking. Every strategy in `table-chunk` is designed to preserve header context in the most embedding-efficient way for that strategy's output format.

---

## 5. Table Detection and Extraction

When a document contains multiple content types (prose + code + tables), `table-chunk` can locate and extract all table regions before parsing. This is the job of `detectTables()`. When the input is already an isolated table string (a single CSV file, a single HTML `<table>` element, a single markdown table), detection is skipped and parsing begins directly.

### 5.1 Markdown Table Detection

GFM markdown tables are identified by a specific pattern: a pipe-delimited row followed immediately by a separator row, followed by one or more pipe-delimited data rows.

**Detection pattern**:

1. Scan the document line by line.
2. A line is a candidate table row if it contains at least one `|` character.
3. The line immediately following a candidate row is a separator row if every cell in it matches `/^:?-+:?$/` after trimming whitespace and stripping leading/trailing pipes. A separator cell must contain at least one `-`.
4. A table begins at the candidate row preceding the separator row and extends through all consecutive pipe-delimited lines that follow.

**Edge cases**:

- **No outer pipes**: GFM allows tables without leading and trailing `|` characters. `Name | Age | City` is a valid table row. Detection handles both forms.
- **Code block exclusion**: Lines inside fenced code blocks (between ` ``` ` or `~~~` delimiters) are excluded from table detection even if they contain pipe characters. A code example showing a markdown table is not extracted as a table.
- **Alignment markers**: Separator rows may contain `:` for alignment (`|:---|:---:|---:|`). These are valid separators.
- **Minimum column count**: A line with a single `|` that is not part of a multi-column pattern is not treated as a table row. Tables must have at least two columns.

**Table region**: A detected markdown table region records the start line number, end line number, and the raw lines of the table.

### 5.2 HTML Table Detection

HTML tables are identified by `<table>` elements. Detection uses a tag scanner that tracks nesting depth to handle nested tables.

**Detection rules**:

1. Scan the HTML for `<table` opening tags (case-insensitive, ignoring attributes).
2. Each `<table>` begins a table region. Track the nesting depth: a `<table>` inside a `<table>` increments the depth counter. The outer `</table>` that brings depth back to zero ends the region.
3. Record the character offset range (start index, end index) of each detected table region.

**Nested tables**: Nested `<table>` elements (a `<table>` inside a `<td>`) are extracted as independent table regions. The outer table's cell that contains the nested table is treated as containing complex content. By default, nested tables are extracted and chunked independently; the outer table treats the cell as empty. The `nestedTables: 'ignore' | 'extract' | 'flatten'` option controls this behavior.

**Caption and summary**: `<caption>` elements within the `<table>` are extracted and stored in the `Table` metadata as `caption`. The HTML `summary` attribute on `<table>` is also captured.

### 5.3 CSV/TSV Detection

When the input format is explicitly `'csv'` or `'tsv'`, detection is bypassed and the entire input is parsed as a single table. When format is `'auto'` and the input contains no HTML tags or pipe-table separators, `table-chunk` attempts CSV detection:

**CSV heuristics**:

1. Count occurrences of `,`, `\t`, `;`, and `|` in the first 10 lines.
2. The delimiter with the most consistent occurrence count across lines (lowest variance in per-line count) wins.
3. If `\t` has consistent counts, the format is TSV.
4. If `,` has consistent counts, the format is CSV.
5. If `;` has consistent counts (common in European locales), the format is semicolon-delimited CSV.
6. If no delimiter produces consistent counts, the input is treated as a single-column CSV.

**Header row detection**: The first row of a CSV is treated as a header row if it meets any of:
- All values are non-numeric strings (a row of pure text column names).
- The `hasHeader` option is explicitly `true`.
- If `hasHeader` is `false`, synthetic column names are generated.

### 5.4 Mixed-Content Documents

For documents that contain prose, code blocks, and tables interspersed, `detectTables()` returns an array of `TableRegion` objects, each describing the position and format of one detected table. The caller then decides whether to extract and chunk each table independently, or to use `table-chunk` in a pipeline with `chunk-smart` (where `chunk-smart` handles the prose and passes table regions to `table-chunk` for specialized handling).

`detectTables()` does not modify the document. It returns positions and format hints only. The caller passes individual table regions to `parseTable()` or `chunkTable()` for processing.

---

## 6. Table Parsing

Parsing converts raw table markup (a markdown table string, an HTML `<table>` element string, or a CSV string) into a normalized `Table` object. All format-specific syntax is stripped. The result is a clean, uniform structure regardless of input format.

### 6.1 The `Table` Type

```typescript
interface Table {
  /** Column header strings, one per column. Never empty. */
  headers: string[];

  /** Data rows. Each inner array has the same length as headers. */
  rows: string[][];

  /** Metadata describing the table's origin and structure. */
  metadata: TableMetadata;
}

interface TableMetadata {
  /** Source format of the raw input. */
  format: 'markdown' | 'html' | 'csv' | 'tsv';

  /** Total number of data rows (not including the header). */
  rowCount: number;

  /** Total number of columns. */
  columnCount: number;

  /**
   * True if headers were inferred (generated as "Column 1", "Column 2", ...)
   * rather than detected in the source.
   */
  inferredHeaders: boolean;

  /** Caption text extracted from HTML <caption> or table title from context, if any. */
  caption?: string;

  /** For HTML tables: the value of the summary attribute, if present. */
  htmlSummary?: string;

  /**
   * For markdown tables: alignment per column, if alignment markers were present.
   * 'left' | 'center' | 'right' | 'none' for each column.
   */
  alignment?: Array<'left' | 'center' | 'right' | 'none'>;

  /**
   * True if the table was force-expanded from merged cells (rowspan/colspan).
   * Indicates that some cells are duplicated from their original merged value.
   */
  hadMergedCells?: boolean;

  /**
   * For multi-level HTML headers: the raw header levels before flattening.
   * e.g., [["Q1", "Q2"], ["Revenue", "Cost", "Revenue", "Cost"]]
   */
  originalHeaderLevels?: string[][];
}
```

### 6.2 Markdown Table Parsing

**Algorithm**:

1. Split the raw input into lines. Identify the header row (line 0), the separator row (line 1), and data rows (lines 2 onward).
2. Parse the separator row to detect column alignment markers (`:---` = left, `:---:` = center, `---:` = right, `---` = none).
3. Split each row on unescaped `|` characters. A pipe is escaped if immediately preceded by `\`. Strip the leading and trailing pipes if present.
4. Trim whitespace from each cell value.
5. Strip inline markdown formatting from header cells: remove `**bold**`, `*italic*`, `` `code` ``, `[link](url)`, `~~strikethrough~~`. Data cells retain their formatting (it may be semantically meaningful for embedding).
6. Validate that all rows have the same column count as the header row. If a data row has fewer cells, pad with empty strings. If it has more cells, truncate (and emit a warning in metadata).
7. Produce `Table` with `headers` from step 5 and `rows` from step 4.

**Escaped pipes**: A literal pipe character within a cell is written as `\|` in GFM markdown. The parser converts `\|` to `|` in the cell value.

**Empty cells**: An empty cell between two `||` pipes becomes an empty string `""` in the row array.

### 6.3 HTML Table Parsing

HTML table parsing is more involved because of `<thead>`/`<tbody>`/`<tfoot>` structure, merged cells (`rowspan`/`colspan`), and multi-level headers.

**Parsing with `htmlparser2`**: `htmlparser2` is a fast, streaming HTML parser that handles malformed HTML robustly. The table parser registers handlers for `<table>`, `<thead>`, `<tbody>`, `<tfoot>`, `<tr>`, `<th>`, `<td>`, and their closing tags. As the parser fires events, the handler builds a two-dimensional grid.

**Grid construction**:

1. Initialize a two-dimensional grid (`string[][]`) of the table's dimensions (rows x columns). Dimensions are not known in advance; the grid grows dynamically.
2. Maintain a `cursor` pointing to the current (row, col) position.
3. For each `<th>` or `<td>`, read the `rowspan` and `colspan` attributes (defaulting to 1 if absent).
4. Advance the cursor to the next unfilled cell in the current row. If the current column is already filled (from a prior `rowspan` expansion), skip to the next unfilled column.
5. Fill the cell at (cursor.row, cursor.col) with the cell text content.
6. If `colspan > 1`, fill (cursor.row, cursor.col+1) through (cursor.row, cursor.col + colspan - 1) with the same value.
7. If `rowspan > 1`, fill (cursor.row+1, cursor.col) through (cursor.row + rowspan - 1, cursor.col) with the same value (and their colspan expansions if applicable).
8. Advance the cursor past the filled cell(s).
9. When `</tr>` fires, advance to the next row.

**Header identification**: Cells from `<thead>` rows, or cells using `<th>` elements, are treated as header cells. If there are multiple header rows (multi-level headers), they are flattened:

- **Two-level headers**: A header row with `colspan` spanning multiple columns over a sub-header row is flattened to qualified names. For example, a "Q1" header spanning "Revenue" and "Cost" becomes `"Q1 Revenue"` and `"Q1 Cost"`.
- **Single-row `<th>` elements**: Used directly as headers.
- **No `<th>` and no `<thead>`**: If the table contains only `<td>` elements, the first row is used as headers, and `inferredHeaders` is set to `false`. If `hasHeader: false` is configured, synthetic column names are used.

**Cell text extraction**: HTML inside cells (bold, italics, links, nested elements) is stripped to plain text for the cell value. The `preserveCellHtml` option retains the raw HTML.

**`<tfoot>` rows**: Footer rows are appended to the data rows array after all body rows.

### 6.4 CSV/TSV Parsing

CSV parsing delegates to `csv-parse` in synchronous mode with the following configuration:

```typescript
import { parse } from 'csv-parse/sync';

const records = parse(input, {
  delimiter: detectedDelimiter,  // ',', '\t', ';', or '|'
  quote: '"',
  escape: '"',      // RFC 4180: doubled quotes inside quoted fields
  relax_quotes: true,
  relax_column_count: true,
  trim: true,
  skip_empty_lines: true,
});
```

After parsing, the first record becomes the headers array (if `hasHeader` is true or auto-detected), and remaining records become the rows matrix. Cells are always strings; no type inference is performed. Rows with fewer cells than the header are padded with empty strings. Rows with more cells than the header are truncated.

---

## 7. Chunking Strategies

After parsing, the `Table` object is passed to the chunking stage. The chunking strategy determines how rows (and optionally columns) are grouped and how each group is converted to a text string. All strategies share a common output type: `TableChunk[]`.

### 7.1 Row-Based Chunking (Default)

Row-based chunking groups N consecutive data rows into a single chunk. Each chunk begins with the header row in the same format as the source table. This is the safest default: the output is valid markdown/tabular content with all column names present, suitable for both embedding and display.

**Algorithm**:

1. Slice the `rows` array into batches of `rowsPerChunk` (default: 10).
2. For each batch, reconstruct the table text: format the header row and the batch of data rows in the output format.
3. Set `chunk.metadata.rowRange` to the zero-indexed data row range `[startRow, endRow]` (exclusive).

**Output format options** for row-based chunks:

- `'markdown'` (default): Reconstructs a GFM markdown table with header and separator rows.
- `'csv'`: Reconstructs comma-delimited CSV with header.
- `'tsv'`: Reconstructs tab-delimited with header.
- `'plain'`: Pipe-separated without markdown separator row, simpler plain text.

**Example input** (12-row product table, `rowsPerChunk: 5`):

Chunk 1 (rows 0--4):
```
| Product | SKU | Price | Stock |
|---------|-----|-------|-------|
| Widget A | W-001 | $49.99 | 240 |
| Widget B | W-002 | $39.99 | 85 |
| Gadget X | G-001 | $129.00 | 12 |
| Gadget Y | G-002 | $99.00 | 55 |
| Gizmo Z | Z-001 | $19.99 | 300 |
```

Chunk 2 (rows 5--9):
```
| Product | SKU | Price | Stock |
|---------|-----|-------|-------|
| Gizmo W | Z-002 | $24.99 | 200 |
...
```

**When to use**: The correct default for most tables. Best when the table will be retrieved and displayed to the user, or when the downstream LLM expects tabular format.

**Token efficiency**: Low overhead -- each chunk has one header row of overhead per batch. For a table with 5-word headers and 10 data rows, header overhead is roughly 5--10% of total tokens.

### 7.2 Serialized Chunking

Serialized chunking converts each row to a natural language string. Each serialized row (or small batch of rows) becomes a chunk. The headers are embedded directly into the string rather than prepended as a table row.

**Algorithm**:

1. For each data row (or batch of `rowsPerChunk` rows), call `serializeRow(row, headers, serializationOptions)`.
2. Join the serialized row strings with `\n\n` (double newline) between rows.
3. Each batch becomes one chunk.

**Serialization formats**:

**`key-value`** (default):
```
Name: Alice, Age: 30, City: New York, Department: Engineering
```

**`newline`**:
```
Name: Alice
Age: 30
City: New York
Department: Engineering
```

**`sentence`**:
```
Alice is 30, lives in New York, and works in Engineering.
```
The sentence format uses the first column value as the subject and constructs a clause for each remaining column using the pattern `"Header: value"` joined by commas, with the final clause using "and". If the row has two columns, a simple `"Header1 is Value1, Header2 is Value2."` form is used. For tables where no natural sentence structure emerges, the format falls back to key-value with period termination.

**`template`** (custom):
```typescript
// Template uses {{Header Name}} placeholders
serializeRow(row, headers, {
  format: 'template',
  template: 'Product {{Product}} (SKU: {{SKU}}) costs {{Price}} with {{Stock}} units in stock.'
});
// → "Product Widget A (SKU: W-001) costs $49.99 with 240 units in stock."
```

Template placeholders are `{{Header Name}}` where "Header Name" matches the header string exactly (case-sensitive) or case-insensitively (controlled by `templateCaseSensitive` option, default: `false`).

**Example input** (employee table, serialized, 1 row per chunk):

Chunk 0 text: `"Name: Alice Johnson, Department: Engineering, Level: Senior, Salary: 145000"`

Chunk 1 text: `"Name: Bob Chen, Department: Marketing, Level: Manager, Salary: 128000"`

**When to use**: Best when the table will be queried with natural language questions. Serialized rows align well with embedding models trained on natural language. Produces the highest retrieval relevance for conversational queries. Performance cost is minimal (string formatting only).

**Token efficiency**: Variable. Serialized rows are 10--30% longer than tabular format because column names are repeated in every row rather than once as a header. For tables with many columns, this overhead compounds. For 5-column tables, serialized format uses roughly 1.5x the tokens of row-based format. Token overhead is a worthwhile tradeoff for retrieval quality in most RAG use cases.

### 7.3 Column-Based Chunking

Column-based chunking groups columns rather than rows. Each chunk contains all rows but only a subset of columns. This is designed for very wide tables (20+ columns) where a single full-width row exceeds the token budget, or where queries typically target specific column subsets.

**Algorithm**:

1. Divide the columns into groups of `columnsPerChunk` (default: 5).
2. For each column group, extract the header subset and the corresponding cell values from every row.
3. Reconstruct the mini-table with the column subset and the full set of rows.
4. Each mini-table becomes one chunk.

**Column group overlap**: The `columnOverlap` option (default: 1) includes N columns from the previous group at the start of each group. This provides column context continuity, similar to how row overlap provides context continuity in row-based chunking. The first column of the table is often an identifier column (name, ID, SKU) that should appear in every column chunk. The `anchorColumns` option specifies one or more column indices that are always included in every chunk regardless of grouping.

**Example input** (wide financial table with 18 columns, `columnsPerChunk: 6`, `anchorColumns: [0]`):

Chunk 0 headers: `Product | Q1 Revenue | Q1 Cost | Q1 Profit | Q2 Revenue | Q2 Cost`
Chunk 1 headers: `Product | Q2 Cost | Q2 Profit | Q3 Revenue | Q3 Cost | Q3 Profit`
Chunk 2 headers: `Product | Q3 Profit | Q4 Revenue | Q4 Cost | Q4 Profit | Annual Total`

("Product" appears in every chunk as an anchor column; the preceding group's last column overlaps.)

**When to use**: Wide tables where full-width rows exceed the token budget, or where the query patterns are known to target specific column families. Less useful for tables with 3--10 columns where row-based or serialized strategies are preferable.

**Token efficiency**: Column-based chunking is the most token-efficient strategy for wide tables because each chunk contains the full data for a column subset, with column names appearing only once per chunk. Trade-off: a query targeting values from two different column groups will not find them in the same chunk.

### 7.4 Cell-Level Chunking

Cell-level chunking produces one chunk per cell (or one chunk per row, with each cell individually annotated). Every chunk contains the full context for a single cell: the column name, the row identifier (from the first column or from a configured identifier column), and the cell value.

**Per-cell format**:

```
Table: Employee Directory
Row identifier: Alice Johnson (Name)
Column: Department
Value: Engineering
```

Or in compact form: `"Name=Alice Johnson, Department=Engineering"` (a single row of only the identifier column and the target column).

**Per-row annotation format** (alternative to one chunk per cell): Each row becomes a chunk, but within the chunk, every field is annotated as `ColumnName=Value` on its own line. This produces denser chunks with full row context but no row batching.

**Algorithm**:

1. Identify the row identifier column: the `identifierColumn` option specifies a column index (default: 0, the first column).
2. For each data row, for each non-identifier column:
   - Emit a chunk with the identifier cell value, the column name, and the cell value.
3. Chunk text template: `"{{identifierHeader}}: {{identifierValue}} | {{columnHeader}}: {{cellValue}}"`.

**When to use**: Lookup tables where queries target specific cells by row and column. For example, a configuration reference table where a query might be "what is the default value of the timeout parameter?" and the table has "Parameter | Default | Description | Type". Cell-level chunking lets the embedding for the "timeout" row's "Default" cell be retrieved directly. Not suitable for wide tables with many non-identifier columns, as it produces a very large number of chunks.

**Chunk count**: A table with R rows and C columns produces R × (C - 1) chunks in pure cell-level mode, or R chunks in per-row annotation mode.

### 7.5 Section-Based Chunking

Section-based chunking splits a table at internal section boundaries: blank rows that separate logical groups, or rows whose first cell value matches a section header pattern.

**Section boundary detection**:

1. **Blank rows**: A data row where all cells are empty strings is a section boundary. The blank row is not included in any chunk.
2. **Section header rows**: A data row where the first cell appears to be a heading (all other cells are empty, or the first cell is formatted in bold/caps) is treated as a section header. The section header is included at the top of its section's chunk.
3. **Explicit boundaries**: The `sectionColumn` option specifies a column index. When the value in that column changes from row to row, a new section begins.

**Algorithm**:

1. Scan the rows array for section boundaries.
2. Split the rows into sections at each boundary.
3. For each section, produce a chunk containing the table header, the section header row (if any), and the section's data rows.

**Example input** (product catalog grouped by category, blank rows between categories):

Section 1 chunk:
```
| Category | Product | Price |
|----------|---------|-------|
| Electronics | Laptop Pro | $1299 |
| Electronics | Tablet X | $599 |
| Electronics | Phone Y | $799 |
```

Section 2 chunk:
```
| Category | Product | Price |
|----------|---------|-------|
| Accessories | Case | $29 |
| Accessories | Charger | $49 |
```

**When to use**: Tables that are naturally divided into logical groups -- product catalogs by category, financial statements by section, configuration files by component. Section boundaries make chunks more semantically coherent than equal-sized row batches.

### 7.6 Whole-Table Chunking

Whole-table chunking returns the entire table as a single chunk. No splitting occurs. The output is one `TableChunk` with `rowRange: [0, table.rows.length]`.

**When to use**: Small tables where the entire table fits within the token budget. The `maxTokens` option governs this behavior automatically: when `strategy: 'row-based'` is used, `table-chunk` checks if the whole table fits within `maxTokens` and uses whole-table mode if it does, falling back to batched row-based chunking otherwise. The caller can also request whole-table explicitly with `strategy: 'whole-table'`.

**Fallback behavior**: If the table does not fit within `maxTokens` but `strategy: 'whole-table'` is explicitly requested, `table-chunk` emits a `TableChunk` with `oversized: true` in its metadata and does not truncate. The caller is responsible for handling oversized chunks.

---

## 8. Header Preservation

Header preservation is the central invariant of `table-chunk`. This section specifies exactly how each strategy preserves headers, including edge cases.

### 8.1 Header Repetition (Row-Based)

In row-based chunking, the full header row is prepended to every chunk. The separator row is also included when the output format is `'markdown'`. This ensures that:

1. Each chunk is a valid, self-contained markdown table that can be rendered without reference to other chunks.
2. The embedding for a chunk includes the column names, so queries that mention column names will match.
3. When the chunk is retrieved and presented to an LLM, the LLM sees a complete table with column context.

**Multi-level header repetition**: When the original HTML table had multi-level headers that were flattened to qualified names (e.g., `"Q1 Revenue"`, `"Q1 Cost"`), the flattened header row is repeated in every chunk. The `originalHeaderLevels` metadata field records the pre-flattening structure for callers that need it.

### 8.2 Header Injection (Serialized)

In serialized chunking, headers are injected as prefixes into every field of every row. There are no standalone header rows; the column name is fused with the value. This is strictly more information-dense than header repetition for embedding purposes, because every token in the chunk is either a column name or a value -- no separator rows or pipe characters.

**Handling empty cells in serialization**: When a cell value is empty, the serialized field is omitted unless `includeEmptyCells: true` is set. For example, `"Name: Alice, Department: Engineering"` (omitting `City: ` because it is empty) is preferred over `"Name: Alice, City: , Department: Engineering"` for embedding quality.

### 8.3 Column Context in Cell-Level Chunks

In cell-level chunking, every chunk contains both the column name and the row identifier. No chunk is produced without both pieces of context. If the identifier column is empty for a row, the row index is used as the identifier (`"Row 12"`).

### 8.4 Column Subset Headers (Column-Based)

In column-based chunking, each chunk's header row contains only the headers for the selected column subset. Anchor columns (specified via `anchorColumns`) always appear in every chunk's header, ensuring that the row identifier context is always present.

### 8.5 Multi-Level Headers

HTML tables frequently use multi-level header structures: a top-level header cell with `colspan > 1` spanning several sub-header cells in the row below. For example:

```
| Q1 (colspan=2) | Q2 (colspan=2) |
| Revenue | Cost  | Revenue | Cost  |
| ...     | ...   | ...     | ...   |
```

`table-chunk` flattens this into: `["Q1 Revenue", "Q1 Cost", "Q2 Revenue", "Q2 Cost"]`.

**Flattening algorithm**:

1. Identify all `<thead>` rows or `<th>` rows at the top of the table.
2. If there is only one header row, use it directly.
3. If there are two header rows:
   a. Build a column ownership map from the first row: each `<th>` with `colspan=N` owns N consecutive columns.
   b. For each column, concatenate the owning first-row header with the second-row header, separated by a space.
4. If there are three or more header rows, apply the same process recursively: each column's name is the path from the top-level header to the leaf header, joined with spaces.
5. Deduplicate: if a column's name would be the same as its parent (because the child cell has the same text), use only the child text.

**Repeated-header column names**: When two columns have the same flattened name (e.g., two "Revenue" sub-columns under different top-level groups), a numeric suffix is appended: `"Q1 Revenue"`, `"Q2 Revenue"` (correct), or in the case of genuine duplicates: `"Revenue (1)"`, `"Revenue (2)"`.

---

## 9. Table Serialization

The `serializeRow()` function is a first-class public API in `table-chunk`. It converts a single data row and its header array into an embedding-friendly string. All serialization logic in the chunking strategies delegates to this function.

### 9.1 Key-Value Format

```typescript
serializeRow(
  ['Alice Johnson', '30', 'New York', 'Engineering'],
  ['Name', 'Age', 'City', 'Department']
)
// → "Name: Alice Johnson, Age: 30, City: New York, Department: Engineering"
```

Implementation:
- Join `header + ": " + value` for each (header, value) pair.
- Separate pairs with `", "`.
- Skip pairs where value is empty (configurable via `includeEmptyCells`).

### 9.2 Newline Format

```typescript
serializeRow(
  ['Alice Johnson', '30', 'New York', 'Engineering'],
  ['Name', 'Age', 'City', 'Department'],
  { format: 'newline' }
)
// → "Name: Alice Johnson\nAge: 30\nCity: New York\nDepartment: Engineering"
```

One field per line. Suitable for models that process structured prompts with field-per-line conventions.

### 9.3 Sentence Format

```typescript
serializeRow(
  ['Alice Johnson', '30', 'New York', 'Engineering'],
  ['Name', 'Age', 'City', 'Department'],
  { format: 'sentence' }
)
// → "Alice Johnson is 30 years old, located in New York, and works in Engineering."
```

The sentence format uses heuristics to produce natural language:

1. The first column value is the subject of the sentence.
2. Subsequent fields are attached as clauses: `"${header} is ${value}"` for the second field, `"${header.toLowerCase()} ${value}"` for subsequent fields (treating headers as predicates when possible).
3. The final clause is joined with "and".
4. When the heuristic cannot produce natural language (e.g., a row with purely numeric columns), the format falls back to key-value with a period appended.

**Configurable sentence subject**: The `sentenceSubjectColumn` option specifies which column to use as the sentence subject (default: 0). When the identifier column is not the most natural subject, the caller can select a different column.

### 9.4 Template Format

```typescript
serializeRow(
  ['Widget A', 'W-001', '$49.99', '240'],
  ['Product', 'SKU', 'Price', 'Stock'],
  {
    format: 'template',
    template: '{{Product}} ({{SKU}}) is priced at {{Price}} with {{Stock}} units available.'
  }
)
// → "Widget A (W-001) is priced at $49.99 with 240 units available."
```

Template placeholders are matched case-insensitively by default. Unmatched placeholders are left as-is by default, or replaced with empty string when `removeMissingPlaceholders: true`.

### 9.5 Serializing Multiple Rows

`serializeRow` handles a single row. For multi-row serialized chunks, the calling code in `chunkTable` calls `serializeRow` for each row in the batch and joins the results with `\n\n`. This double-newline separation ensures that embedding models treat each row as a distinct paragraph rather than a single continuous text block.

---

## 10. API Surface

### Installation

```bash
npm install table-chunk
```

### Dependencies

```json
{
  "dependencies": {
    "htmlparser2": "^9.1.0",
    "csv-parse": "^5.5.0"
  }
}
```

### Main Exports

```typescript
import {
  chunkTable,
  parseTable,
  detectTables,
  serializeRow,
  createTableChunker,
} from 'table-chunk';
```

### `chunkTable`

The primary entry point. Detects format, parses the table, applies the strategy, and returns chunks.

```typescript
function chunkTable(input: string, options?: ChunkTableOptions): TableChunk[];
```

```typescript
import { chunkTable } from 'table-chunk';

// Markdown table, row-based, 5 rows per chunk
const chunks = chunkTable(markdownTable, {
  strategy: 'row-based',
  rowsPerChunk: 5,
  outputFormat: 'markdown',
});

// HTML table, serialized
const chunks = chunkTable(htmlTable, {
  format: 'html',
  strategy: 'serialized',
  serialization: { format: 'key-value' },
});

// CSV, token-bounded, row-based
const chunks = chunkTable(csvContent, {
  format: 'csv',
  strategy: 'row-based',
  maxTokens: 512,
  tokenCounter: (text) => Math.ceil(text.length / 4),
});
```

### `parseTable`

Parses raw table input into a normalized `Table` object without chunking. Useful when the caller wants to inspect or transform the table before chunking, or when using a different chunking strategy not provided by `table-chunk`.

```typescript
function parseTable(input: string, format?: TableFormat): Table;
```

```typescript
import { parseTable } from 'table-chunk';

const table = parseTable(markdownTable);
console.log(table.headers);       // ['Name', 'Age', 'City']
console.log(table.rows[0]);       // ['Alice', '30', 'New York']
console.log(table.metadata.rowCount);   // 12
console.log(table.metadata.columnCount); // 3
```

### `detectTables`

Detects all table regions in a mixed-content document. Returns their positions, detected formats, and row/column dimension estimates.

```typescript
function detectTables(document: string, format?: 'auto' | 'markdown' | 'html'): TableRegion[];
```

```typescript
import { detectTables } from 'table-chunk';

const regions = detectTables(documentContent);
// [
//   { format: 'markdown', startLine: 15, endLine: 28, estimatedRows: 12, estimatedColumns: 5 },
//   { format: 'markdown', startLine: 45, endLine: 58, estimatedRows: 12, estimatedColumns: 4 },
// ]

for (const region of regions) {
  const tableText = extractLines(documentContent, region.startLine, region.endLine);
  const chunks = chunkTable(tableText, { format: region.format, strategy: 'serialized' });
  // ... ingest chunks
}
```

### `serializeRow`

Serializes a single data row and its headers into an embedding-friendly string. Available as a standalone utility for callers that want to serialize rows outside of the chunking pipeline.

```typescript
function serializeRow(
  row: string[],
  headers: string[],
  options?: SerializeRowOptions
): string;
```

```typescript
import { serializeRow } from 'table-chunk';

const text = serializeRow(
  ['Alice', '30', 'Engineering'],
  ['Name', 'Age', 'Department'],
  { format: 'key-value' }
);
// → "Name: Alice, Age: 30, Department: Engineering"

const sentence = serializeRow(
  ['Alice', '30', 'Engineering'],
  ['Name', 'Age', 'Department'],
  { format: 'sentence' }
);
// → "Alice is 30 years old and works in Engineering."
```

### `createTableChunker`

Factory function that returns a configured chunker instance. Amortizes option parsing and validation when chunking many tables with the same configuration.

```typescript
function createTableChunker(config: ChunkTableOptions): TableChunker;

interface TableChunker {
  chunk(input: string): TableChunk[];
  parse(input: string): Table;
  chunkTable(table: Table): TableChunk[];
}
```

```typescript
import { createTableChunker } from 'table-chunk';

const chunker = createTableChunker({
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  maxTokens: 512,
  tokenCounter: myTokenCounter,
});

// Reuse across many tables
for (const tableHtml of tables) {
  const chunks = chunker.chunk(tableHtml);
  await ingestChunks(chunks);
}
```

---

## 11. Type Definitions

### Input Types

```typescript
/** Supported source table formats. */
type TableFormat = 'auto' | 'markdown' | 'html' | 'csv' | 'tsv';

/** Table chunking strategies. */
type ChunkStrategy =
  | 'row-based'
  | 'serialized'
  | 'column-based'
  | 'cell-level'
  | 'section-based'
  | 'whole-table';

/** Output format for row-based chunks. */
type RowOutputFormat = 'markdown' | 'csv' | 'tsv' | 'plain';

/** Serialization format for the serialized strategy. */
type SerializationFormat = 'key-value' | 'newline' | 'sentence' | 'template';
```

### `ChunkTableOptions`

```typescript
interface ChunkTableOptions {
  /**
   * Source format of the input.
   * 'auto' detects format from content.
   * Default: 'auto'.
   */
  format?: TableFormat;

  /**
   * Chunking strategy.
   * Default: 'row-based'.
   */
  strategy?: ChunkStrategy;

  /**
   * For 'row-based' strategy: number of data rows per chunk.
   * Ignored when maxTokens is set (token budget governs row count).
   * Default: 10.
   */
  rowsPerChunk?: number;

  /**
   * For 'column-based' strategy: number of columns per chunk.
   * Default: 5.
   */
  columnsPerChunk?: number;

  /**
   * For 'column-based' strategy: column indices to include in every chunk.
   * Default: [0] (the first column, typically an identifier column).
   */
  anchorColumns?: number[];

  /**
   * For 'column-based' strategy: number of columns from the previous group
   * to include at the start of each group for context continuity.
   * Default: 1.
   */
  columnOverlap?: number;

  /**
   * Maximum token budget per chunk. When set, row-based chunking sizes
   * batches dynamically using the tokenCounter to stay under this limit.
   * Requires tokenCounter to be provided for exact results; uses the
   * approximate counter (chars/4) when omitted.
   * Default: undefined (unlimited; rowsPerChunk governs batch size).
   */
  maxTokens?: number;

  /**
   * Token counting function. Receives a string and returns a token count.
   * Default: (text) => Math.ceil(text.length / 4).
   */
  tokenCounter?: (text: string) => number;

  /**
   * For 'row-based' strategy: output format for reconstructed table text.
   * Default: 'markdown'.
   */
  outputFormat?: RowOutputFormat;

  /**
   * Serialization options for the 'serialized' strategy.
   */
  serialization?: SerializeRowOptions;

  /**
   * For 'section-based' strategy: column index whose value changes define
   * section boundaries. Default: undefined (uses blank rows as boundaries).
   */
  sectionColumn?: number;

  /**
   * For 'cell-level' strategy: column index to use as row identifier.
   * Default: 0.
   */
  identifierColumn?: number;

  /**
   * Whether the first row of the input is a header row.
   * Default: 'auto' (detects from content).
   */
  hasHeader?: boolean | 'auto';

  /**
   * For HTML: how to handle nested <table> elements.
   * 'ignore': skip nested tables (treat cell as empty).
   * 'extract': return nested tables as additional separate TableChunk arrays (accessible via metadata).
   * 'flatten': include nested table content as a single string in the cell.
   * Default: 'extract'.
   */
  nestedTables?: 'ignore' | 'extract' | 'flatten';

  /**
   * For HTML: whether to preserve inner HTML in cell values instead of
   * stripping tags to plain text.
   * Default: false.
   */
  preserveCellHtml?: boolean;

  /**
   * Index of the table to chunk when the input contains multiple tables
   * (for detectTables + chunkTable workflows). Zero-based.
   * Default: 0.
   */
  tableIndex?: number;

  /**
   * Whether to include empty cells in serialized output.
   * When false, empty cells are omitted from the serialized string.
   * Default: false.
   */
  includeEmptyCells?: boolean;
}
```

### `SerializeRowOptions`

```typescript
interface SerializeRowOptions {
  /**
   * Serialization format.
   * Default: 'key-value'.
   */
  format?: SerializationFormat;

  /**
   * Template string for 'template' format.
   * Use {{Header Name}} placeholders.
   * Required when format is 'template'.
   */
  template?: string;

  /**
   * Whether template placeholder matching is case-sensitive.
   * Default: false.
   */
  templateCaseSensitive?: boolean;

  /**
   * Whether to remove unmatched template placeholders from the output.
   * Default: false (unmatched placeholders are left as-is).
   */
  removeMissingPlaceholders?: boolean;

  /**
   * For 'sentence' format: the column index to use as the sentence subject.
   * Default: 0.
   */
  sentenceSubjectColumn?: number;

  /**
   * Whether to include empty cell values in the serialized output.
   * Default: false.
   */
  includeEmptyCells?: boolean;
}
```

### `Table`

Defined in section 6.1.

### `TableChunk`

```typescript
interface TableChunk {
  /**
   * The chunk text, ready for embedding.
   * Self-contained: includes all necessary column context.
   */
  text: string;

  /** Metadata describing the chunk's origin and structure. */
  metadata: TableChunkMetadata;
}

interface TableChunkMetadata {
  /** Zero-based index of this chunk within its table's chunks. */
  chunkIndex: number;

  /** Total number of chunks produced from this table. */
  totalChunks: number;

  /**
   * Zero-based index of the source table within the document
   * (relevant when detectTables found multiple tables).
   */
  tableIndex: number;

  /**
   * Zero-indexed range of data rows included in this chunk.
   * [startRow, endRow) -- endRow is exclusive.
   * undefined for whole-table or column-based chunks.
   */
  rowRange?: [number, number];

  /**
   * Zero-indexed range of columns included in this chunk.
   * [startCol, endCol) -- endCol is exclusive.
   * undefined for row-based, serialized, and cell-level chunks.
   */
  columnRange?: [number, number];

  /** Column headers included in this chunk. */
  headers: string[];

  /** Source format of the original table. */
  sourceFormat: 'markdown' | 'html' | 'csv' | 'tsv';

  /** Strategy used to produce this chunk. */
  strategy: ChunkStrategy;

  /** Serialization format used (for 'serialized' and 'cell-level' strategies). */
  serializationFormat?: SerializationFormat;

  /** Total number of data rows in the original table. */
  tableRowCount: number;

  /** Total number of columns in the original table. */
  tableColumnCount: number;

  /** Approximate token count of the chunk text (using the configured tokenCounter). */
  tokenCount: number;

  /**
   * True if the chunk was produced from a table with merged cells
   * that were expanded via rowspan/colspan normalization.
   */
  hadMergedCells?: boolean;

  /**
   * True if this chunk exceeds maxTokens (only possible when strategy is
   * 'whole-table' and the table is oversized).
   */
  oversized?: boolean;

  /** Caption of the source table, if detected. */
  caption?: string;

  /**
   * For 'section-based' strategy: the section label for this chunk,
   * if a section header row was detected.
   */
  sectionLabel?: string;

  /**
   * For 'cell-level' strategy: the row identifier value and the column name
   * for the cell this chunk represents.
   */
  cellContext?: {
    rowIdentifier: string;
    columnName: string;
  };
}
```

### `TableRegion`

```typescript
interface TableRegion {
  /** Detected format of the table at this region. */
  format: 'markdown' | 'html';

  /**
   * For markdown: zero-based line number of the first table row (header row).
   */
  startLine?: number;

  /**
   * For markdown: zero-based line number of the last data row.
   */
  endLine?: number;

  /**
   * For HTML: character offset of the opening <table> tag.
   */
  startOffset?: number;

  /**
   * For HTML: character offset of the closing </table> tag (inclusive).
   */
  endOffset?: number;

  /** Estimated number of data rows. */
  estimatedRows: number;

  /** Estimated number of columns. */
  estimatedColumns: number;

  /**
   * The raw table string extracted from the document.
   * Populated by detectTables when extractContent is true (default: false).
   */
  content?: string;
}
```

---

## 12. Chunk Metadata

Every `TableChunk` carries a `metadata` object (typed as `TableChunkMetadata` above) that is sufficient for the caller to:

1. **Reconstruct context**: Know the row range, column range, and headers without looking at the chunk text.
2. **Filter by table**: Use `tableIndex` to filter all chunks from a specific table within a multi-table document.
3. **Build table-of-contents**: Use `chunkIndex` and `totalChunks` to know how many chunks came from a given table and in what order.
4. **Debug chunking**: Use `sourceFormat`, `strategy`, `serializationFormat`, and `hadMergedCells` to understand exactly how the chunk was produced.
5. **Token budgeting**: Use `tokenCount` to enforce downstream token limits without re-counting.
6. **Surface provenance in UI**: Display `caption`, `sectionLabel`, `headers`, and `rowRange` to users in a retrieval interface.

**Metadata is always serializable**: All metadata fields are plain JavaScript primitives or arrays of primitives. No functions, no circular references, no class instances. `JSON.stringify(chunk.metadata)` always works.

---

## 13. Merged Cell Handling

Merged cells are a common source of parsing failures in HTML table processing. A `rowspan="3"` means that one cell spans three rows, and the following two rows in that column have no `<td>` element. A `colspan="2"` means that one cell spans two columns, and the following column in that row has no `<td>` element. If the parser does not account for these, the resulting grid has holes.

### Expansion Algorithm

The grid construction algorithm described in section 6.3 handles both `rowspan` and `colspan` through cursor advancement with a fill-ahead approach:

1. Maintain a `fillGrid: Map<string, string>` (where the key is `"row,col"`) for cells that have been pre-filled by a preceding rowspan or colspan.
2. Before processing each `<th>` or `<td>`, check `fillGrid` at the current cursor position. If pre-filled, skip to the next unfilled position.
3. After filling a cell, apply its `colspan` (fill right) and `rowspan` (fill down) into `fillGrid`.

### Implications for Chunking

After expansion, the `Table.rows` matrix is fully rectangular: every row has exactly `headers.length` cells. Cells that were expanded from merged originals carry the same string value as the source cell. This means:

- In row-based chunks, a row with a merged cell that spanned three rows will show the same value in all three rows' chunks. This is the correct behavior for semantic coherence (the reader sees the actual value, not a hole).
- In serialized chunks, the repeated value is serialized in each row individually.
- The `hadMergedCells: true` metadata flag alerts the caller that some cell duplication occurred.

### Table-Level and Complex Merges

Certain table structures use merged cells to create visual groupings that have no straightforward mapping to a rectangular grid (e.g., a table where a cell spans both rows and columns of a section header). After expansion, these produce duplicated values across multiple rows and columns. The `originalHeaderLevels` metadata provides the pre-expansion structure for callers that need it.

---

## 14. Configuration Reference

All options are available both as function parameters to `chunkTable()`, `parseTable()`, and `detectTables()`, and as constructor arguments to `createTableChunker()`. The following table lists every option with its type, default, and which functions accept it.

| Option | Type | Default | Functions |
|---|---|---|---|
| `format` | `TableFormat` | `'auto'` | `chunkTable`, `parseTable`, `detectTables`, `createTableChunker` |
| `strategy` | `ChunkStrategy` | `'row-based'` | `chunkTable`, `createTableChunker` |
| `rowsPerChunk` | `number` | `10` | `chunkTable`, `createTableChunker` |
| `columnsPerChunk` | `number` | `5` | `chunkTable`, `createTableChunker` |
| `anchorColumns` | `number[]` | `[0]` | `chunkTable`, `createTableChunker` |
| `columnOverlap` | `number` | `1` | `chunkTable`, `createTableChunker` |
| `maxTokens` | `number` | `undefined` | `chunkTable`, `createTableChunker` |
| `tokenCounter` | `(text: string) => number` | `chars/4` | `chunkTable`, `createTableChunker` |
| `outputFormat` | `RowOutputFormat` | `'markdown'` | `chunkTable`, `createTableChunker` |
| `serialization` | `SerializeRowOptions` | `{ format: 'key-value' }` | `chunkTable`, `createTableChunker` |
| `sectionColumn` | `number` | `undefined` | `chunkTable`, `createTableChunker` |
| `identifierColumn` | `number` | `0` | `chunkTable`, `createTableChunker` |
| `hasHeader` | `boolean \| 'auto'` | `'auto'` | `chunkTable`, `parseTable`, `createTableChunker` |
| `nestedTables` | `'ignore' \| 'extract' \| 'flatten'` | `'extract'` | `chunkTable`, `parseTable`, `createTableChunker` |
| `preserveCellHtml` | `boolean` | `false` | `chunkTable`, `parseTable`, `createTableChunker` |
| `tableIndex` | `number` | `0` | `chunkTable`, `createTableChunker` |
| `includeEmptyCells` | `boolean` | `false` | `chunkTable`, `serializeRow`, `createTableChunker` |

---

## 15. Integration

### Integration with `chunk-smart`

`chunk-smart` is the general document chunker in this monorepo. It handles prose, code, JSON, and markdown documents. For markdown tables, `chunk-smart` treats the entire table as an atomic unit (when it fits within `maxChunkSize`) or force-splits it by rows when it does not (with `forceSplit: true` in metadata). The canonical integration for documents with large tables is:

```typescript
import { chunk } from 'chunk-smart';
import { chunkTable } from 'table-chunk';
import { detectTables } from 'table-chunk';

// Step 1: Detect tables in the document
const tableRegions = detectTables(document, 'markdown');

// Step 2: Replace table regions with placeholders for chunk-smart
let processedDoc = document;
for (let i = tableRegions.length - 1; i >= 0; i--) {
  const region = tableRegions[i];
  // Replace table region with a placeholder token
  processedDoc = replaceLines(processedDoc, region.startLine, region.endLine, `[TABLE_${i}]`);
}

// Step 3: Chunk the prose with chunk-smart
const proseChunks = chunk(processedDoc, { maxChunkSize: 512 });

// Step 4: Chunk each table with table-chunk
const tableChunkMap: Record<string, TableChunk[]> = {};
for (let i = 0; i < tableRegions.length; i++) {
  const tableText = extractLines(document, tableRegions[i].startLine, tableRegions[i].endLine);
  tableChunkMap[`TABLE_${i}`] = chunkTable(tableText, {
    strategy: 'serialized',
    maxTokens: 512,
  });
}

// Step 5: Combine prose and table chunks for embedding
const allChunks = mergeAndOrder(proseChunks, tableChunkMap);
```

### Integration with `md-to-data`

`md-to-data` extracts markdown tables into typed JavaScript objects (`Record<string, unknown>[]`). `table-chunk` chunks markdown tables into embedding-ready strings. They serve different purposes and are not substitutes for each other.

In a pipeline that needs both structured data and RAG embeddings from the same table, the recommended approach is to parse the source table with `parseTable()` (which gives a normalized `Table` object) and then either pass it to a `createTableChunker` instance for RAG chunking, or pass the raw markdown to `md-to-data`'s `parseTable()` for structured data extraction. The two packages do not need to be aware of each other.

### Integration with `doc-table-extract`

`doc-table-extract` extracts tables from PDFs and scanned images. Its output is structured table data (arrays of rows and cells) extracted via computer vision and OCR. `table-chunk` consumes this output by accepting the normalized data format and converting it to `Table` objects for chunking.

A `Table` object can be constructed directly from `doc-table-extract` output and passed to `createTableChunker().chunkTable(table)` without going through text parsing, since the data is already structured.

### Integration with `rag-prompt-builder`

`rag-prompt-builder` builds RAG prompts from retrieved chunks. `TableChunk` objects are fully compatible with `rag-prompt-builder`'s chunk format. The `text` field provides the chunk content; the `metadata` field carries provenance. When building prompts that include retrieved table data, `rag-prompt-builder` can display the serialized row format as natural language context or reconstruct a markdown table from the row-based format using the chunk's `headers` metadata.

---

## 16. CLI

`table-chunk` ships a CLI that reads table content from stdin or a file and writes `TableChunk[]` as JSON to stdout.

### Usage

```
table-chunk [options] [file]
```

If `file` is omitted, reads from stdin. If `file` is provided, reads from that file path. Writes to stdout.

### Options

```
-f, --format <format>        Input format: auto, markdown, html, csv, tsv (default: auto)
-s, --strategy <strategy>    Chunking strategy: row-based, serialized, column-based,
                             cell-level, section-based, whole-table (default: row-based)
-r, --rows-per-chunk <n>     Data rows per chunk for row-based strategy (default: 10)
-c, --columns-per-chunk <n>  Columns per chunk for column-based strategy (default: 5)
    --max-tokens <n>         Maximum tokens per chunk (enables token-bounded chunking)
    --serialization <fmt>    Serialization format: key-value, newline, sentence, template
                             (default: key-value; used with --strategy serialized)
    --template <string>      Template string for serialization=template
    --output-format <fmt>    Row chunk output: markdown, csv, tsv, plain (default: markdown)
    --table-index <n>        Which table to chunk in multi-table documents (default: 0)
    --no-header              Treat first row as data, not headers
    --include-empty-cells    Include empty cell values in serialized output
    --detect                 Detect and list table regions only, do not chunk
-o, --output <file>          Write output to file instead of stdout
    --pretty                 Pretty-print JSON output (default: false)
-h, --help                   Show this help message
    --version                Show version number
```

### Examples

```bash
# Chunk a markdown table file, 10 rows per chunk, markdown output
table-chunk product-catalog.md

# Chunk an HTML page's first table with serialized format
table-chunk --format html --strategy serialized --serialization key-value page.html

# Chunk a CSV with token budget, pretty-printed output
table-chunk --format csv --max-tokens 512 --pretty data.csv

# Detect all tables in a markdown document
table-chunk --detect documentation.md

# Pipe from stdin
cat table.md | table-chunk --strategy serialized | jq '.[].text'

# Chunk with custom sentence template
table-chunk --strategy serialized --serialization template \
  --template "{{Product}} costs {{Price}} and is in stock: {{InStock}}" \
  products.md
```

### Output Shape

Each CLI invocation outputs a JSON array of `TableChunk` objects:

```json
[
  {
    "text": "| Product | SKU | Price |\n|---------|-----|-------|\n| Widget A | W-001 | $49.99 |",
    "metadata": {
      "chunkIndex": 0,
      "totalChunks": 3,
      "tableIndex": 0,
      "rowRange": [0, 10],
      "headers": ["Product", "SKU", "Price"],
      "sourceFormat": "markdown",
      "strategy": "row-based",
      "tableRowCount": 28,
      "tableColumnCount": 3,
      "tokenCount": 42,
      "hadMergedCells": false
    }
  }
]
```

### Exit Codes

| Code | Meaning |
|---|---|
| 0 | Success |
| 1 | Parse error (input could not be parsed as a table) |
| 2 | Configuration error (invalid options, missing required argument) |
| 3 | File not found or not readable |

---

## 17. Testing Strategy

### Unit Tests: Parser Coverage

Each parser (markdown, HTML, CSV) has dedicated unit tests covering:

- **Standard inputs**: Well-formed tables in each format produce the expected `Table` object.
- **Edge cases per format**:
  - Markdown: no outer pipes, escaped pipes, alignment markers, empty cells, tables without separators, tables inside code blocks (not extracted).
  - HTML: `<thead>`/`<tbody>`/`<tfoot>`, `rowspan`, `colspan`, multi-level headers, nested tables, missing `<th>` (falls back to first-row headers), `<caption>`.
  - CSV: comma/tab/semicolon/pipe delimiters, RFC 4180 quoting, escaped quotes (`""`), Windows line endings (`\r\n`), trailing commas, no-header CSV.
- **Malformed input**: Truncated HTML tables, CSV with inconsistent column counts, markdown rows with wrong pipe counts -- all produce best-effort output with appropriate metadata flags rather than throwing.

### Unit Tests: Strategy Coverage

Each chunking strategy has dedicated unit tests covering:

- **Small tables** (fewer rows than `rowsPerChunk`): single chunk produced, correct row range.
- **Exact multiple** (rows divisible by `rowsPerChunk`): correct number of chunks, no empty chunks.
- **Non-multiple** (last chunk has fewer rows): last chunk has correct row range.
- **Single-row tables**: one chunk with one data row.
- **Header repetition**: every row-based chunk begins with the header row (and separator for markdown output).
- **Serialization correctness**: key-value, newline, sentence, and template formats for representative inputs.
- **Column-based**: correct column groups, anchor column presence, column overlap.
- **Cell-level**: correct chunk count (R × (C - 1)), correct `cellContext` metadata.
- **Section-based**: correct section boundaries from blank rows and from `sectionColumn` changes.
- **Token-bounded**: with a mocked token counter, row batches are sized to stay under `maxTokens`.

### Unit Tests: `serializeRow`

- All four serialization formats on representative inputs.
- Empty cells omitted when `includeEmptyCells: false`, included when `true`.
- Template format: matching placeholders, unmatched placeholders, case-insensitive matching.
- Sentence format fallback to key-value when no natural sentence structure is possible.

### Unit Tests: Merged Cell Handling

- Single `rowspan="3"`: correct grid expansion.
- Single `colspan="2"`: correct grid expansion.
- Combined `rowspan` and `colspan` on the same cell.
- Multi-level headers with `colspan`: correct flattened column names.
- Nested table extraction: nested table returned as separate region.

### Integration Tests

- Full `chunkTable` pipeline: markdown input → detected format → parsed table → chunked → `TableChunk[]` with correct metadata.
- Full `chunkTable` pipeline: HTML input with merged cells → normalized table → serialized chunks.
- Full `chunkTable` pipeline: CSV input → detected delimiter → correct headers → row-based chunks.
- `detectTables` on a mixed document: correct regions returned for each table.
- `createTableChunker` factory: multiple tables chunked with the same configuration produce correct independent outputs.

### Snapshot Tests

Representative tables in each format and each strategy produce snapshot-tested output. Snapshots are committed to the repository and reviewed on changes. Any change to chunk text or metadata for existing inputs requires a deliberate snapshot update.

### Performance Tests

Performance is tested with representative large tables:

- 1000-row CSV, row-based strategy.
- 500-row HTML table with merged cells, serialized strategy.
- 200-row markdown table, column-based strategy.

Benchmarks are run with `vitest bench` and results are reported in CI. Regressions above 20% are flagged.

---

## 18. Performance

### Parsing Performance

**Markdown**: The markdown table parser is a line-by-line scanner with no backtracking. Parsing a 1000-row, 10-column markdown table completes in under 5ms on commodity hardware. The bottleneck is string splitting and trimming, not algorithmic complexity.

**HTML**: HTML parsing uses `htmlparser2`'s synchronous `parseDocument()` API. A 500-row HTML table with merged cells completes in under 20ms. `htmlparser2` is significantly faster than DOMParser-based approaches and handles malformed HTML without throwing.

**CSV**: CSV parsing delegates to `csv-parse/sync`. A 10,000-row CSV file (100 KB) completes in under 50ms.

### Chunking Performance

Chunking is O(R × C) where R is the number of rows and C is the number of columns. String concatenation is the dominant cost. For the serialized strategy, the `serializeRow` function is called once per row; its implementation uses a single `Array.prototype.join` call per row.

### Memory

`table-chunk` does not stream; it processes the entire input in memory. The `Table` object holds the full rows matrix. Memory usage is proportional to the number of cells: a 1000-row, 20-column table with average cell length of 20 characters uses approximately 400 KB for the rows matrix plus overhead. For very large tables (100,000+ rows), streaming is not currently supported.

### No Async Operations

All operations are synchronous. `chunkTable`, `parseTable`, `detectTables`, and `serializeRow` all return values (not Promises). There are no I/O operations. The CLI reads its input file synchronously before processing.

---

## 19. Dependencies

### Runtime Dependencies

| Package | Version | Purpose |
|---|---|---|
| `htmlparser2` | `^9.1.0` | HTML table parsing. Fast, SAX-style, handles malformed HTML. |
| `csv-parse` | `^5.5.0` | CSV/TSV parsing. RFC 4180 compliant, handles edge cases. |

### Development Dependencies

| Package | Version | Purpose |
|---|---|---|
| `typescript` | `^5.4.0` | TypeScript compiler |
| `vitest` | `^1.6.0` | Test runner |
| `eslint` | `^9.0.0` | Linting |

### Why `htmlparser2`

`htmlparser2` is used over alternatives for these reasons:

- **`parse5`**: The most spec-compliant HTML5 parser but significantly heavier and slower. Full HTML5 compliance is unnecessary for `<table>` element parsing.
- **`cheerio`**: Built on `htmlparser2` and adds jQuery-like selectors. The selector overhead is unnecessary; direct SAX-style parsing is more efficient for the grid construction algorithm.
- **`jsdom`**: A full DOM implementation. Extremely heavy for server-side table parsing.
- **Hand-written regex**: Regex-based HTML parsing cannot reliably handle `rowspan`/`colspan` combinations. `htmlparser2` provides robust event-based parsing that correctly fires close events for all open tags.

### Why `csv-parse`

`csv-parse` is used over `papaparse` because:

- `papaparse` is primarily browser-oriented and its Node.js streaming API requires async handling. `csv-parse` has a clean `sync` subpath export.
- `csv-parse` is RFC 4180 compliant and handles all edge cases that `papaparse` handles, with a slightly smaller bundle size for the sync variant.
- `csv-parse` is maintained and widely used in the Node.js ecosystem.

---

## 20. File Structure

```
table-chunk/
├── package.json
├── tsconfig.json
├── SPEC.md
├── README.md
├── src/
│   ├── index.ts               # Public API exports
│   ├── types.ts               # All TypeScript types and interfaces
│   ├── detect.ts              # detectTables() -- table region detection
│   ├── parse/
│   │   ├── index.ts           # parseTable() -- format dispatch
│   │   ├── markdown.ts        # Markdown table parser
│   │   ├── html.ts            # HTML table parser (uses htmlparser2)
│   │   └── csv.ts             # CSV/TSV parser (uses csv-parse)
│   ├── chunk/
│   │   ├── index.ts           # chunkTable() -- strategy dispatch
│   │   ├── row-based.ts       # Row-based chunking strategy
│   │   ├── serialized.ts      # Serialized chunking strategy
│   │   ├── column-based.ts    # Column-based chunking strategy
│   │   ├── cell-level.ts      # Cell-level chunking strategy
│   │   ├── section-based.ts   # Section-based chunking strategy
│   │   └── whole-table.ts     # Whole-table strategy
│   ├── serialize.ts           # serializeRow() -- standalone serialization utility
│   ├── factory.ts             # createTableChunker() -- configured factory
│   ├── format.ts              # Table text reconstruction (markdown/csv/tsv/plain output)
│   └── cli.ts                 # CLI entry point
├── test/
│   ├── parse/
│   │   ├── markdown.test.ts
│   │   ├── html.test.ts
│   │   └── csv.test.ts
│   ├── chunk/
│   │   ├── row-based.test.ts
│   │   ├── serialized.test.ts
│   │   ├── column-based.test.ts
│   │   ├── cell-level.test.ts
│   │   └── section-based.test.ts
│   ├── serialize.test.ts
│   ├── detect.test.ts
│   ├── integration.test.ts
│   └── __snapshots__/
│       └── integration.test.ts.snap
└── dist/                      # TypeScript build output (gitignored)
    ├── index.js
    ├── index.d.ts
    └── ...
```

The `src/parse/`, `src/chunk/`, and `src/` structure separates concerns cleanly:

- `types.ts` has no imports from other source files. All other modules import from it.
- `parse/` modules are pure functions: string → `Table`. No side effects.
- `chunk/` modules are pure functions: `Table` + options → `TableChunk[]`. No side effects.
- `serialize.ts` is a pure function: `string[]` + `string[]` + options → `string`. No side effects.
- `detect.ts` is a pure function: `string` → `TableRegion[]`. No side effects.
- `chunk/index.ts` dispatches to the appropriate strategy module based on `options.strategy`.
- `parse/index.ts` dispatches to the appropriate parser based on detected or specified format.
- `factory.ts` composes `parse/index.ts` and `chunk/index.ts` behind a configured instance.
- `cli.ts` handles argument parsing, file I/O, and calls `chunkTable` from `chunk/index.ts`.

---

## 21. Implementation Roadmap

### Phase 1: Core Pipeline (v0.1.0)

The minimum viable implementation that delivers the central value proposition: tables never lose their headers.

**Deliverables**:
- `parseTable()` for all three formats (markdown, HTML, CSV/TSV).
- `chunkTable()` with `row-based` strategy and `markdown` output format.
- `TableChunk` type with complete metadata.
- Header repetition in every row-based chunk.
- Merged cell expansion for HTML tables.
- `Table`, `TableChunk`, `TableRegion` types exported from `index.ts`.
- Full test coverage for parsers and row-based strategy.
- CLI with `--format`, `--strategy row-based`, `--rows-per-chunk`, `--output`.

**Scope exclusions in v0.1.0**: Serialized strategy, column-based strategy, cell-level strategy, section-based strategy, `detectTables`, `createTableChunker`, `serializeRow` as a public API, `maxTokens`, custom token counters, multi-level header flattening.

### Phase 2: Serialization and Detection (v0.2.0)

**Deliverables**:
- `serializeRow()` with all four formats (key-value, newline, sentence, template).
- `chunkTable()` with `serialized` strategy.
- `detectTables()` for markdown and HTML documents.
- `createTableChunker()` factory.
- `maxTokens` token-bounded chunking with default and pluggable token counter.
- Multi-level HTML header flattening.
- Full test coverage for serialized strategy and detection.
- CLI flags: `--strategy serialized`, `--serialization`, `--template`, `--max-tokens`, `--detect`.

### Phase 3: Advanced Strategies (v0.3.0)

**Deliverables**:
- `column-based` strategy with `anchorColumns` and `columnOverlap`.
- `cell-level` strategy with `identifierColumn`.
- `section-based` strategy with blank-row and `sectionColumn` detection.
- `whole-table` strategy with `oversized` metadata flag.
- `nestedTables` option for HTML.
- All output formats for row-based: CSV, TSV, plain.
- Full test coverage for all new strategies.
- Snapshot tests for all strategies on representative inputs.
- Performance benchmarks.

### Phase 4: Polish and Integration (v0.4.0)

**Deliverables**:
- `preserveCellHtml` option for HTML.
- `includeEmptyCells` option for serialized.
- `tableIndex` option for multi-table document selection.
- Integration tests with `chunk-smart` and `rag-prompt-builder`.
- Performance optimization for large tables.
- README with complete usage examples and integration guides.

---

## 22. Example Use Cases

### Financial Data Tables

A quarterly financial report PDF is converted to markdown using `pdf-parse`. The markdown contains 12 tables: income statement, balance sheet, cash flow statement, and quarterly breakdowns. Each table has 4--20 rows and 6--10 columns with headers like "Revenue", "Cost of Goods Sold", "Gross Profit", "Q1", "Q2", "Q3", "Q4".

**Strategy**: Serialized, key-value format. Each row becomes "Revenue: $4.2B, Q1: $950M, Q2: $1.1B, Q3: $1.05B, Q4: $1.15B". Natural language queries like "what was Q3 revenue?" match well with serialized row embeddings.

```typescript
const chunker = createTableChunker({
  format: 'markdown',
  strategy: 'serialized',
  serialization: { format: 'key-value' },
  maxTokens: 512,
});

for (const tableMarkdown of extractedTables) {
  const chunks = chunker.chunk(tableMarkdown);
  await vectorStore.upsert(chunks.map(c => ({ content: c.text, meta: c.metadata })));
}
```

### Product Catalog

An e-commerce platform ingests a 5,000-row product catalog CSV. Each row has 15 columns: SKU, Name, Category, Subcategory, Price, Sale Price, Stock, Weight, Dimensions, Color, Material, Brand, Description, Tags, Image URL.

**Strategy**: Row-based for structure-preserving ingestion, with `maxTokens: 512` and token-bounded chunking. Each chunk contains the header row plus as many product rows as fit in 512 tokens (approximately 8--12 rows depending on description length).

**Supplemental serialized index**: In addition to row-based chunks for tabular retrieval, a second pass produces serialized chunks with `format: 'sentence'` for conversational queries: "Widget A is a 30.00 dollar blue cotton item by BrandX with 240 units in stock."

```typescript
const tableChunks = chunkTable(csvContent, {
  format: 'csv',
  strategy: 'row-based',
  maxTokens: 512,
  outputFormat: 'markdown',
});

const sentenceChunks = chunkTable(csvContent, {
  format: 'csv',
  strategy: 'serialized',
  serialization: { format: 'sentence', sentenceSubjectColumn: 1 }, // Name column
  rowsPerChunk: 1, // one sentence per product per chunk
});
```

### API Documentation Tables

An API documentation site is scraped as HTML. Each endpoint page has a "Parameters" table (columns: Name, Type, Required, Default, Description) and a "Response Fields" table (columns: Field, Type, Description). Each table has 5--30 rows.

**Strategy**: Cell-level, using the "Name" column (column 0) as the row identifier. This produces one chunk per parameter, e.g., `"Name: timeout | Type: integer | Required: no | Default: 30 | Description: Request timeout in seconds"`. A query for "what is the default timeout?" matches the cell-level chunk for the timeout row's Default column.

```typescript
const chunks = chunkTable(paramTableHtml, {
  format: 'html',
  strategy: 'cell-level',
  identifierColumn: 0,
});
```

### Research Data Tables

A bioinformatics team has a 10,000-row CSV of gene expression data: Gene ID, Gene Name, Condition, Expression Level, Fold Change, P-Value, Significance. The table is too large for any single embedding and needs to be chunked for RAG over scientific publications.

**Strategy**: Section-based chunking using `sectionColumn: 2` (Condition column), which groups all rows for each experimental condition together. Each section chunk covers one condition's genes, making it retrievable by queries like "which genes are upregulated under hypoxia?".

**Wide-table supplement**: Column-based chunking with `anchorColumns: [0, 1]` (Gene ID and Gene Name) and `columnsPerChunk: 4` produces chunks focused on subsets of measurements while always including gene identifiers for context.

```typescript
const conditionChunks = chunkTable(geneData, {
  format: 'csv',
  strategy: 'section-based',
  sectionColumn: 2, // Condition
  maxTokens: 1024,
});
```

### Comparison Tables in Technical Documentation

A cloud infrastructure documentation page contains a feature comparison table with 6 service tiers (rows) and 22 feature columns. The table is too wide for any single chunk. Queries target specific feature-tier combinations: "does the enterprise tier support custom domains?".

**Strategy**: Column-based chunking with `anchorColumns: [0]` (tier name column), `columnsPerChunk: 5`, `columnOverlap: 1`. Each chunk contains the tier name plus 5 feature columns, with one overlap column for context. A query about "custom domains" retrieves the chunk containing the "Custom Domains" column.

```typescript
const chunks = chunkTable(comparisonTableHtml, {
  format: 'html',
  strategy: 'column-based',
  columnsPerChunk: 5,
  anchorColumns: [0],
  columnOverlap: 1,
  outputFormat: 'markdown',
});
```

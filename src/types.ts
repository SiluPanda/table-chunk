/** Supported source table formats. */
export type TableFormat = 'auto' | 'markdown' | 'html' | 'csv' | 'tsv';

/** Table chunking strategies. */
export type ChunkStrategy =
  | 'row-based'
  | 'serialized'
  | 'column-based'
  | 'cell-level'
  | 'section-based'
  | 'whole-table';

/** Output format for row-based chunks. */
export type RowOutputFormat = 'markdown' | 'csv' | 'tsv' | 'plain';

/** Serialization format for the serialized strategy. */
export type SerializationFormat = 'key-value' | 'newline' | 'sentence' | 'template';

/** Metadata describing a table's origin and structure. */
export interface TableMetadata {
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
   */
  alignment?: Array<'left' | 'center' | 'right' | 'none'>;

  /**
   * True if the table was force-expanded from merged cells (rowspan/colspan).
   */
  hadMergedCells?: boolean;

  /**
   * For multi-level HTML headers: the raw header levels before flattening.
   */
  originalHeaderLevels?: string[][];
}

/** A parsed, normalized table. */
export interface Table {
  /** Column header strings, one per column. Never empty. */
  headers: string[];

  /** Data rows. Each inner array has the same length as headers. */
  rows: string[][];

  /** Metadata describing the table's origin and structure. */
  metadata: TableMetadata;
}

/** Metadata for a table chunk. */
export interface TableChunkMetadata {
  /** Zero-based index of this chunk within its table's chunks. */
  chunkIndex: number;

  /** Total number of chunks produced from this table. */
  totalChunks: number;

  /**
   * Zero-based index of the source table within the document.
   */
  tableIndex: number;

  /**
   * Zero-indexed range of data rows included in this chunk.
   * [startRow, endRow) -- endRow is exclusive.
   */
  rowRange?: [number, number];

  /**
   * Zero-indexed range of columns included in this chunk.
   * [startCol, endCol) -- endCol is exclusive.
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

  /** Approximate token count of the chunk text. */
  tokenCount: number;

  /**
   * True if the chunk was produced from a table with merged cells.
   */
  hadMergedCells?: boolean;

  /**
   * True if this chunk exceeds maxTokens.
   */
  oversized?: boolean;

  /** Caption of the source table, if detected. */
  caption?: string;

  /**
   * For 'section-based' strategy: the section label for this chunk.
   */
  sectionLabel?: string;

  /**
   * For 'cell-level' strategy: the row identifier value and the column name.
   */
  cellContext?: {
    rowIdentifier: string;
    columnName: string;
  };
}

/** A table chunk ready for embedding. */
export interface TableChunk {
  /** The chunk text, ready for embedding. */
  text: string;

  /** Metadata describing the chunk's origin and structure. */
  metadata: TableChunkMetadata;
}

/** A detected table region in a document. */
export interface TableRegion {
  /** Detected format of the table at this region. */
  format: 'markdown' | 'html';

  /** For markdown: zero-based line number of the first table row. */
  startLine?: number;

  /** For markdown: zero-based line number of the last data row. */
  endLine?: number;

  /** For HTML: character offset of the opening <table> tag. */
  startOffset?: number;

  /** For HTML: character offset after the closing </table> tag. */
  endOffset?: number;

  /** Estimated number of data rows. */
  estimatedRows: number;

  /** Estimated number of columns. */
  estimatedColumns: number;

  /** The raw table string extracted from the document. */
  content?: string;
}

/** Options for chunkTable. */
export interface ChunkTableOptions {
  /** Source format. Default: 'auto'. */
  format?: TableFormat;

  /** Chunking strategy. Default: 'row-based'. */
  strategy?: ChunkStrategy;

  /** For 'row-based': rows per chunk. Default: 10. */
  rowsPerChunk?: number;

  /** For 'column-based': columns per chunk. Default: 5. */
  columnsPerChunk?: number;

  /** For 'column-based': column indices always included. Default: [0]. */
  anchorColumns?: number[];

  /** For 'column-based': overlap columns. Default: 1. */
  columnOverlap?: number;

  /** Max tokens per chunk. Default: undefined. */
  maxTokens?: number;

  /** Token counter function. Default: chars/4. */
  tokenCounter?: (text: string) => number;

  /** For 'row-based': output format. Default: 'markdown'. */
  outputFormat?: RowOutputFormat;

  /** Serialization options for 'serialized' strategy. */
  serialization?: SerializeRowOptions;

  /** For 'section-based': column index for section boundaries. */
  sectionColumn?: number;

  /** For 'cell-level': column index for row identifier. Default: 0. */
  identifierColumn?: number;

  /** Whether first row is header. Default: 'auto'. */
  hasHeader?: boolean | 'auto';

  /** For HTML: nested table handling. Default: 'extract'. */
  nestedTables?: 'ignore' | 'extract' | 'flatten';

  /** For HTML: preserve inner HTML in cells. Default: false. */
  preserveCellHtml?: boolean;

  /** Table index for multi-table documents. Default: 0. */
  tableIndex?: number;

  /** Include empty cells in serialized output. Default: false. */
  includeEmptyCells?: boolean;
}

/** Options for serializeRow. */
export interface SerializeRowOptions {
  /** Serialization format. Default: 'key-value'. */
  format?: SerializationFormat;

  /** Template string for 'template' format. */
  template?: string;

  /** Whether template matching is case-sensitive. Default: false. */
  templateCaseSensitive?: boolean;

  /** Whether to remove unmatched placeholders. Default: false. */
  removeMissingPlaceholders?: boolean;

  /** For 'sentence': column index for sentence subject. Default: 0. */
  sentenceSubjectColumn?: number;

  /** Include empty cells. Default: false. */
  includeEmptyCells?: boolean;
}

/** A configured chunker instance. */
export interface TableChunker {
  chunk(input: string): TableChunk[];
  parse(input: string): Table;
  chunkTable(table: Table): TableChunk[];
}

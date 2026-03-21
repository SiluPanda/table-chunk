import { describe, it, expect } from 'vitest';
import { chunkTable, parseTable, chunk } from '../index';
import { Table } from '../types';

describe('Row-based chunking', () => {
  const markdownTable = `| Product | SKU | Price | Stock |
| --- | --- | --- | --- |
| Widget A | W-001 | $49.99 | 240 |
| Widget B | W-002 | $39.99 | 85 |
| Gadget X | G-001 | $129.00 | 12 |
| Gadget Y | G-002 | $99.00 | 55 |
| Gizmo Z | Z-001 | $19.99 | 300 |
| Gizmo W | Z-002 | $24.99 | 200 |
| Thing A | T-001 | $9.99 | 500 |
| Thing B | T-002 | $14.99 | 350 |
| Part X | P-001 | $4.99 | 1000 |
| Part Y | P-002 | $7.99 | 800 |
| Item 1 | I-001 | $59.99 | 30 |
| Item 2 | I-002 | $69.99 | 20 |`;

  it('chunks into correct number of batches', () => {
    const chunks = chunkTable(markdownTable, { rowsPerChunk: 5 });
    expect(chunks.length).toBe(3); // 12 rows / 5 = 3 chunks (5, 5, 2)
  });

  it('each chunk contains the header row', () => {
    const chunks = chunkTable(markdownTable, { rowsPerChunk: 5 });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Product');
      expect(chunk.text).toContain('SKU');
      expect(chunk.text).toContain('Price');
      expect(chunk.text).toContain('Stock');
    }
  });

  it('produces valid markdown format', () => {
    const chunks = chunkTable(markdownTable, {
      rowsPerChunk: 3,
      outputFormat: 'markdown',
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('| --- | --- | --- | --- |');
    }
  });

  it('produces CSV format', () => {
    const chunks = chunkTable(markdownTable, {
      rowsPerChunk: 3,
      outputFormat: 'csv',
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Product,SKU,Price,Stock');
      expect(chunk.text).not.toContain('|');
    }
  });

  it('produces TSV format', () => {
    const chunks = chunkTable(markdownTable, {
      rowsPerChunk: 3,
      outputFormat: 'tsv',
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Product\tSKU\tPrice\tStock');
    }
  });

  it('produces plain format', () => {
    const chunks = chunkTable(markdownTable, {
      rowsPerChunk: 3,
      outputFormat: 'plain',
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Product | SKU | Price | Stock');
      expect(chunk.text).not.toContain('---');
    }
  });

  it('sets correct row ranges', () => {
    const chunks = chunkTable(markdownTable, { rowsPerChunk: 5 });
    expect(chunks[0].metadata.rowRange).toEqual([0, 5]);
    expect(chunks[1].metadata.rowRange).toEqual([5, 10]);
    expect(chunks[2].metadata.rowRange).toEqual([10, 12]);
  });

  it('sets correct metadata', () => {
    const chunks = chunkTable(markdownTable, { rowsPerChunk: 5 });
    for (let i = 0; i < chunks.length; i++) {
      expect(chunks[i].metadata.chunkIndex).toBe(i);
      expect(chunks[i].metadata.totalChunks).toBe(3);
      expect(chunks[i].metadata.strategy).toBe('row-based');
      expect(chunks[i].metadata.sourceFormat).toBe('markdown');
      expect(chunks[i].metadata.tableRowCount).toBe(12);
      expect(chunks[i].metadata.tableColumnCount).toBe(4);
      expect(chunks[i].metadata.headers).toEqual(['Product', 'SKU', 'Price', 'Stock']);
    }
  });

  it('includes token count in metadata', () => {
    const chunks = chunkTable(markdownTable, { rowsPerChunk: 5 });
    for (const chunk of chunks) {
      expect(chunk.metadata.tokenCount).toBeGreaterThan(0);
      // Default token counter is chars/4
      expect(chunk.metadata.tokenCount).toBe(Math.ceil(chunk.text.length / 4));
    }
  });

  it('respects maxTokens for token-bounded batching', () => {
    const chunks = chunkTable(markdownTable, {
      maxTokens: 100,
    });
    for (const chunk of chunks) {
      // Each chunk should be at or under the token limit
      // (except possibly single-row chunks that exceed)
      expect(chunk.metadata.tokenCount).toBeLessThanOrEqual(100 + 50); // allow some slack for single large rows
    }
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('uses custom token counter', () => {
    const counter = (text: string) => text.split(/\s+/).length;
    const chunks = chunkTable(markdownTable, {
      rowsPerChunk: 3,
      tokenCounter: counter,
    });
    for (const chunk of chunks) {
      expect(chunk.metadata.tokenCount).toBe(counter(chunk.text));
    }
  });

  it('handles empty table', () => {
    const input = `| A | B |
| --- | --- |`;
    const chunks = chunkTable(input, { rowsPerChunk: 5 });
    expect(chunks.length).toBe(1);
    expect(chunks[0].metadata.rowRange).toEqual([0, 0]);
  });
});

describe('Serialized chunking', () => {
  const input = `| Name | Age | City |
| --- | --- | --- |
| Alice | 30 | New York |
| Bob | 25 | London |
| Carol | 35 | Paris |`;

  it('produces key-value serialized chunks', () => {
    const chunks = chunkTable(input, {
      strategy: 'serialized',
      serialization: { format: 'key-value' },
      rowsPerChunk: 1,
    });
    expect(chunks.length).toBe(3);
    expect(chunks[0].text).toBe('Name: Alice, Age: 30, City: New York');
    expect(chunks[1].text).toBe('Name: Bob, Age: 25, City: London');
    expect(chunks[2].text).toBe('Name: Carol, Age: 35, City: Paris');
  });

  it('produces newline serialized chunks', () => {
    const chunks = chunkTable(input, {
      strategy: 'serialized',
      serialization: { format: 'newline' },
      rowsPerChunk: 1,
    });
    expect(chunks[0].text).toBe('Name: Alice\nAge: 30\nCity: New York');
  });

  it('produces sentence serialized chunks', () => {
    const chunks = chunkTable(input, {
      strategy: 'serialized',
      serialization: { format: 'sentence' },
      rowsPerChunk: 1,
    });
    expect(chunks[0].text).toContain('Alice');
    expect(chunks[0].text).toContain('Age');
    expect(chunks[0].text).toContain('City');
  });

  it('batches multiple rows per chunk', () => {
    const chunks = chunkTable(input, {
      strategy: 'serialized',
      serialization: { format: 'key-value' },
      rowsPerChunk: 2,
    });
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('Alice');
    expect(chunks[0].text).toContain('Bob');
    expect(chunks[0].text).toContain('\n\n'); // double newline between rows
  });

  it('sets serialization format in metadata', () => {
    const chunks = chunkTable(input, {
      strategy: 'serialized',
      serialization: { format: 'key-value' },
    });
    for (const chunk of chunks) {
      expect(chunk.metadata.strategy).toBe('serialized');
      expect(chunk.metadata.serializationFormat).toBe('key-value');
    }
  });

  it('skips empty cells by default', () => {
    const emptyInput = `| Name | City | Notes |
| --- | --- | --- |
| Alice | New York |  |`;

    const chunks = chunkTable(emptyInput, {
      strategy: 'serialized',
      serialization: { format: 'key-value' },
    });
    expect(chunks[0].text).toBe('Name: Alice, City: New York');
    expect(chunks[0].text).not.toContain('Notes');
  });

  it('includes empty cells when configured', () => {
    const emptyInput = `| Name | City | Notes |
| --- | --- | --- |
| Alice | New York |  |`;

    const chunks = chunkTable(emptyInput, {
      strategy: 'serialized',
      serialization: { format: 'key-value', includeEmptyCells: true },
      includeEmptyCells: true,
    });
    expect(chunks[0].text).toContain('Notes:');
  });
});

describe('Column-based chunking', () => {
  const wideTable = `| Name | A | B | C | D | E | F | G | H |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Alice | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |
| Bob | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |`;

  it('splits columns into groups', () => {
    const chunks = chunkTable(wideTable, {
      strategy: 'column-based',
      columnsPerChunk: 4,
      anchorColumns: [0],
    });
    expect(chunks.length).toBeGreaterThan(1);
  });

  it('includes anchor column in every chunk', () => {
    const chunks = chunkTable(wideTable, {
      strategy: 'column-based',
      columnsPerChunk: 4,
      anchorColumns: [0],
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Name');
    }
  });

  it('sets column range in metadata', () => {
    const chunks = chunkTable(wideTable, {
      strategy: 'column-based',
      columnsPerChunk: 4,
      anchorColumns: [0],
    });
    for (const chunk of chunks) {
      expect(chunk.metadata.columnRange).toBeDefined();
      expect(chunk.metadata.strategy).toBe('column-based');
    }
  });

  it('all rows appear in each chunk', () => {
    const chunks = chunkTable(wideTable, {
      strategy: 'column-based',
      columnsPerChunk: 4,
      anchorColumns: [0],
    });
    for (const chunk of chunks) {
      expect(chunk.text).toContain('Alice');
      expect(chunk.text).toContain('Bob');
    }
  });
});

describe('Cell-level chunking', () => {
  const input = `| Name | Dept | Level |
| --- | --- | --- |
| Alice | Engineering | Senior |
| Bob | Marketing | Manager |`;

  it('produces one chunk per non-identifier cell', () => {
    const chunks = chunkTable(input, {
      strategy: 'cell-level',
      identifierColumn: 0,
    });
    // 2 rows x 2 non-identifier columns = 4 chunks
    expect(chunks.length).toBe(4);
  });

  it('includes row identifier and column name in chunk text', () => {
    const chunks = chunkTable(input, {
      strategy: 'cell-level',
    });
    expect(chunks[0].text).toContain('Name: Alice');
    expect(chunks[0].text).toContain('Dept: Engineering');
  });

  it('sets cell context in metadata', () => {
    const chunks = chunkTable(input, {
      strategy: 'cell-level',
    });
    expect(chunks[0].metadata.cellContext).toEqual({
      rowIdentifier: 'Alice',
      columnName: 'Dept',
    });
  });

  it('uses row index as identifier when cell is empty', () => {
    const emptyIdInput = `| ID | Value |
| --- | --- |
|  | 42 |`;

    const chunks = chunkTable(emptyIdInput, {
      strategy: 'cell-level',
    });
    expect(chunks[0].metadata.cellContext?.rowIdentifier).toBe('Row 1');
  });
});

describe('Section-based chunking', () => {
  it('splits on blank rows', () => {
    const table: Table = {
      headers: ['Category', 'Product', 'Price'],
      rows: [
        ['Electronics', 'Laptop', '$1299'],
        ['Electronics', 'Tablet', '$599'],
        ['', '', ''],
        ['Accessories', 'Case', '$29'],
        ['Accessories', 'Charger', '$49'],
      ],
      metadata: {
        format: 'markdown',
        rowCount: 5,
        columnCount: 3,
        inferredHeaders: false,
      },
    };

    const chunks = chunk(table, { strategy: 'section-based' });
    expect(chunks.length).toBe(2);
    expect(chunks[0].text).toContain('Laptop');
    expect(chunks[0].text).not.toContain('Case');
    expect(chunks[1].text).toContain('Case');
    expect(chunks[1].text).not.toContain('Laptop');
  });

  it('splits on section column value changes', () => {
    const table: Table = {
      headers: ['Dept', 'Name', 'Level'],
      rows: [
        ['Eng', 'Alice', 'Senior'],
        ['Eng', 'Bob', 'Junior'],
        ['Mktg', 'Carol', 'Manager'],
        ['Mktg', 'Dave', 'Analyst'],
      ],
      metadata: {
        format: 'csv',
        rowCount: 4,
        columnCount: 3,
        inferredHeaders: false,
      },
    };

    const chunks = chunk(table, {
      strategy: 'section-based',
      sectionColumn: 0,
    });
    expect(chunks.length).toBe(2);
    expect(chunks[0].metadata.sectionLabel).toBe('Eng');
    expect(chunks[1].metadata.sectionLabel).toBe('Mktg');
  });

  it('handles section header rows', () => {
    const table: Table = {
      headers: ['Category', 'Product', 'Price'],
      rows: [
        ['Electronics', '', ''],
        ['', 'Laptop', '$1299'],
        ['', 'Tablet', '$599'],
        ['Accessories', '', ''],
        ['', 'Case', '$29'],
      ],
      metadata: {
        format: 'markdown',
        rowCount: 5,
        columnCount: 3,
        inferredHeaders: false,
      },
    };

    const chunks = chunk(table, { strategy: 'section-based' });
    expect(chunks.length).toBe(2);
  });
});

describe('Whole-table chunking', () => {
  const input = `| A | B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |`;

  it('returns single chunk', () => {
    const chunks = chunkTable(input, { strategy: 'whole-table' });
    expect(chunks.length).toBe(1);
    expect(chunks[0].metadata.rowRange).toEqual([0, 2]);
  });

  it('marks oversized chunks when exceeding maxTokens', () => {
    const chunks = chunkTable(input, {
      strategy: 'whole-table',
      maxTokens: 1, // Very low limit
    });
    expect(chunks[0].metadata.oversized).toBe(true);
  });

  it('does not mark oversized when within maxTokens', () => {
    const chunks = chunkTable(input, {
      strategy: 'whole-table',
      maxTokens: 10000,
    });
    expect(chunks[0].metadata.oversized).toBeUndefined();
  });
});

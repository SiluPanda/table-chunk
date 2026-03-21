import { describe, it, expect } from 'vitest';
import {
  chunkTable,
  parseTable,
  detectTables,
  serializeRow,
  createTableChunker,
  chunk,
  estimateTokens,
} from '../index';

describe('Integration tests', () => {
  describe('Format auto-detection', () => {
    it('auto-detects markdown format', () => {
      const input = `| A | B |
| --- | --- |
| 1 | 2 |`;
      const chunks = chunkTable(input);
      expect(chunks[0].metadata.sourceFormat).toBe('markdown');
    });

    it('auto-detects HTML format', () => {
      const input = `<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>`;
      const chunks = chunkTable(input);
      expect(chunks[0].metadata.sourceFormat).toBe('html');
    });

    it('auto-detects CSV format', () => {
      const input = `Name,Age,City
Alice,30,New York`;
      const chunks = chunkTable(input);
      expect(chunks[0].metadata.sourceFormat).toBe('csv');
    });
  });

  describe('End-to-end markdown pipeline', () => {
    const markdown = `| Product | SKU | Price | Stock |
| --- | --- | --- | --- |
| Widget A | W-001 | $49.99 | 240 |
| Widget B | W-002 | $39.99 | 85 |
| Gadget X | G-001 | $129.00 | 12 |
| Gadget Y | G-002 | $99.00 | 55 |
| Gizmo Z | Z-001 | $19.99 | 300 |`;

    it('parse -> chunk pipeline works', () => {
      const table = parseTable(markdown, 'markdown');
      expect(table.headers).toEqual(['Product', 'SKU', 'Price', 'Stock']);
      expect(table.rows.length).toBe(5);

      const chunks = chunk(table, { strategy: 'row-based', rowsPerChunk: 3 });
      expect(chunks.length).toBe(2);
      expect(chunks[0].metadata.rowRange).toEqual([0, 3]);
      expect(chunks[1].metadata.rowRange).toEqual([3, 5]);
    });

    it('chunkTable convenience function works', () => {
      const chunks = chunkTable(markdown, {
        strategy: 'serialized',
        serialization: { format: 'key-value' },
        rowsPerChunk: 1,
      });
      expect(chunks.length).toBe(5);
      expect(chunks[0].text).toContain('Product: Widget A');
      expect(chunks[0].text).toContain('SKU: W-001');
    });
  });

  describe('End-to-end HTML pipeline', () => {
    const html = `<table>
      <thead>
        <tr><th>Employee</th><th>Department</th><th>Level</th></tr>
      </thead>
      <tbody>
        <tr><td>Alice</td><td>Engineering</td><td>Senior</td></tr>
        <tr><td>Bob</td><td>Marketing</td><td>Manager</td></tr>
        <tr><td>Carol</td><td>Sales</td><td>Associate</td></tr>
      </tbody>
    </table>`;

    it('parses and chunks HTML table', () => {
      const chunks = chunkTable(html, {
        format: 'html',
        strategy: 'serialized',
        serialization: { format: 'key-value' },
        rowsPerChunk: 1,
      });
      expect(chunks.length).toBe(3);
      expect(chunks[0].text).toBe('Employee: Alice, Department: Engineering, Level: Senior');
    });

    it('cell-level chunking on HTML', () => {
      const chunks = chunkTable(html, {
        format: 'html',
        strategy: 'cell-level',
      });
      // 3 rows x 2 non-id columns = 6 chunks
      expect(chunks.length).toBe(6);
    });
  });

  describe('End-to-end CSV pipeline', () => {
    const csv = `Name,Age,City
Alice,30,New York
Bob,25,London
Carol,35,Paris`;

    it('parses and chunks CSV', () => {
      const chunks = chunkTable(csv, {
        format: 'csv',
        strategy: 'row-based',
        rowsPerChunk: 2,
        outputFormat: 'csv',
      });
      expect(chunks.length).toBe(2);
      expect(chunks[0].text).toContain('Name,Age,City');
      expect(chunks[0].text).toContain('Alice');
    });
  });

  describe('createTableChunker', () => {
    it('creates a reusable chunker', () => {
      const chunker = createTableChunker({
        strategy: 'serialized',
        serialization: { format: 'key-value' },
        rowsPerChunk: 1,
      });

      const md = `| A | B |
| --- | --- |
| 1 | 2 |`;

      const chunks = chunker.chunk(md);
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe('A: 1, B: 2');
    });

    it('parse method returns Table', () => {
      const chunker = createTableChunker({});
      const md = `| X | Y |
| --- | --- |
| a | b |`;
      const table = chunker.parse(md);
      expect(table.headers).toEqual(['X', 'Y']);
    });

    it('chunkTable method accepts parsed Table', () => {
      const chunker = createTableChunker({
        strategy: 'row-based',
        rowsPerChunk: 1,
      });
      const table = parseTable(`| A | B |
| --- | --- |
| 1 | 2 |
| 3 | 4 |`, 'markdown');

      const chunks = chunker.chunkTable(table);
      expect(chunks.length).toBe(2);
    });
  });

  describe('estimateTokens', () => {
    it('estimates tokens as chars/4', () => {
      expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75, ceil = 3
      expect(estimateTokens('')).toBe(0);
      expect(estimateTokens('a')).toBe(1);
    });
  });

  describe('Mixed-content document workflow', () => {
    it('detect + parse + chunk pipeline', () => {
      const doc = `# Report

Some introductory text.

| Quarter | Revenue | Profit |
| --- | --- | --- |
| Q1 | $1M | $200K |
| Q2 | $1.2M | $250K |
| Q3 | $1.5M | $350K |
| Q4 | $2M | $500K |

Conclusion text.`;

      // Step 1: Detect tables
      const regions = detectTables(doc);
      expect(regions.length).toBe(1);

      // Step 2: Parse the detected table
      const table = parseTable(regions[0].content!, 'markdown');
      expect(table.headers).toEqual(['Quarter', 'Revenue', 'Profit']);
      expect(table.rows.length).toBe(4);

      // Step 3: Chunk
      const chunks = chunk(table, {
        strategy: 'serialized',
        serialization: { format: 'key-value' },
        rowsPerChunk: 2,
      });
      expect(chunks.length).toBe(2);
      expect(chunks[0].text).toContain('Q1');
      expect(chunks[0].text).toContain('Q2');
      expect(chunks[1].text).toContain('Q3');
      expect(chunks[1].text).toContain('Q4');
    });
  });

  describe('Edge cases', () => {
    it('handles single-cell table', () => {
      const input = `| A |
| --- |
| 1 |`;
      // Single-column tables need explicit format since auto-detection
      // requires 2+ columns to distinguish from CSV
      const chunks = chunkTable(input, { format: 'markdown' });
      expect(chunks.length).toBe(1);
      expect(chunks[0].metadata.headers).toEqual(['A']);
    });

    it('handles very wide table', () => {
      const cols = Array.from({ length: 20 }, (_, i) => `Col${i}`);
      const header = `| ${cols.join(' | ')} |`;
      const sep = `| ${cols.map(() => '---').join(' | ')} |`;
      const row = `| ${cols.map((_, i) => `v${i}`).join(' | ')} |`;
      const input = [header, sep, row].join('\n');

      const chunks = chunkTable(input, {
        strategy: 'column-based',
        columnsPerChunk: 5,
        anchorColumns: [0],
      });
      expect(chunks.length).toBeGreaterThan(1);
      // Each chunk should include the anchor column
      for (const c of chunks) {
        expect(c.text).toContain('Col0');
      }
    });

    it('handles table with special characters', () => {
      const input = `| Symbol | Meaning |
| --- | --- |
| < | Less than |
| > | Greater than |
| & | Ampersand |`;

      const table = parseTable(input, 'markdown');
      expect(table.rows[0]).toEqual(['<', 'Less than']);
      expect(table.rows[2]).toEqual(['&', 'Ampersand']);
    });

    it('preserves cell HTML when configured', () => {
      const input = `<table>
        <tr><th>Name</th></tr>
        <tr><td><b>Alice</b></td></tr>
      </table>`;

      const table = parseTable(input, 'html');
      expect(table.rows[0][0]).toBe('Alice'); // stripped by default

      // Re-parse with preserveCellHtml via chunkTable
      const chunks = chunkTable(input, {
        format: 'html',
        preserveCellHtml: true,
        strategy: 'whole-table',
      });
      expect(chunks[0].text).toContain('<b>Alice</b>');
    });
  });
});

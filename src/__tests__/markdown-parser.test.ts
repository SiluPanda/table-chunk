import { describe, it, expect } from 'vitest';
import { parseTable } from '../index';

describe('Markdown table parser', () => {
  it('parses a basic GFM pipe table', () => {
    const input = `| Name | Age | City |
| --- | --- | --- |
| Alice | 30 | New York |
| Bob | 25 | London |`;

    const table = parseTable(input, 'markdown');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows).toEqual([
      ['Alice', '30', 'New York'],
      ['Bob', '25', 'London'],
    ]);
    expect(table.metadata.format).toBe('markdown');
    expect(table.metadata.rowCount).toBe(2);
    expect(table.metadata.columnCount).toBe(3);
    expect(table.metadata.inferredHeaders).toBe(false);
  });

  it('handles alignment markers in separator', () => {
    const input = `| Left | Center | Right | None |
|:---|:---:|---:|---|
| a | b | c | d |`;

    const table = parseTable(input, 'markdown');
    expect(table.metadata.alignment).toEqual(['left', 'center', 'right', 'none']);
    expect(table.headers).toEqual(['Left', 'Center', 'Right', 'None']);
  });

  it('handles tables without outer pipes', () => {
    const input = `Name | Age | City
--- | --- | ---
Alice | 30 | New York`;

    const table = parseTable(input, 'markdown');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows).toEqual([['Alice', '30', 'New York']]);
  });

  it('handles escaped pipes in cells', () => {
    const input = `| Expression | Result |
| --- | --- |
| a \\| b | true |
| c \\| d | false |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows[0]).toEqual(['a | b', 'true']);
    expect(table.rows[1]).toEqual(['c | d', 'false']);
  });

  it('handles empty cells', () => {
    const input = `| A | B | C |
| --- | --- | --- |
| 1 |  | 3 |
| | 2 | |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows[0]).toEqual(['1', '', '3']);
    expect(table.rows[1]).toEqual(['', '2', '']);
  });

  it('pads rows with fewer cells than header', () => {
    const input = `| A | B | C |
| --- | --- | --- |
| 1 | 2 |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows[0]).toEqual(['1', '2', '']);
  });

  it('truncates rows with more cells than header', () => {
    const input = `| A | B |
| --- | --- |
| 1 | 2 | 3 | 4 |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows[0]).toEqual(['1', '2']);
  });

  it('strips markdown formatting from headers', () => {
    const input = `| **Bold** | *Italic* | \`Code\` | [Link](url) | ~~Strike~~ |
| --- | --- | --- | --- | --- |
| a | b | c | d | e |`;

    const table = parseTable(input, 'markdown');
    expect(table.headers).toEqual(['Bold', 'Italic', 'Code', 'Link', 'Strike']);
  });

  it('preserves formatting in data cells', () => {
    const input = `| Name | Notes |
| --- | --- |
| Alice | **important** note |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows[0][1]).toBe('**important** note');
  });

  it('handles a single-row table', () => {
    const input = `| A | B |
| --- | --- |
| 1 | 2 |`;

    const table = parseTable(input, 'markdown');
    expect(table.rows.length).toBe(1);
    expect(table.rows[0]).toEqual(['1', '2']);
  });

  it('handles a table with many rows', () => {
    const headerRow = '| ID | Name |';
    const separator = '| --- | --- |';
    const dataRows = Array.from({ length: 50 }, (_, i) => `| ${i + 1} | Item ${i + 1} |`);
    const input = [headerRow, separator, ...dataRows].join('\n');

    const table = parseTable(input, 'markdown');
    expect(table.rows.length).toBe(50);
    expect(table.metadata.rowCount).toBe(50);
  });

  it('handles header-only table (no data rows)', () => {
    const input = `| A | B | C |
| --- | --- | --- |`;

    const table = parseTable(input, 'markdown');
    expect(table.headers).toEqual(['A', 'B', 'C']);
    expect(table.rows).toEqual([]);
    expect(table.metadata.rowCount).toBe(0);
  });

  it('throws for input with no separator row', () => {
    const input = `| A | B |
| 1 | 2 |`;

    expect(() => parseTable(input, 'markdown')).toThrow();
  });

  it('handles whitespace in cells', () => {
    const input = `|  A  |  B  |
| --- | --- |
|  hello world  |  foo  |`;

    const table = parseTable(input, 'markdown');
    expect(table.headers).toEqual(['A', 'B']);
    expect(table.rows[0]).toEqual(['hello world', 'foo']);
  });
});

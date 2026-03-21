import { describe, it, expect } from 'vitest';
import { parseTable } from '../index';

describe('CSV parser', () => {
  it('parses basic CSV with header', () => {
    const input = `Name,Age,City
Alice,30,New York
Bob,25,London`;

    const table = parseTable(input, 'csv');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows).toEqual([
      ['Alice', '30', 'New York'],
      ['Bob', '25', 'London'],
    ]);
    expect(table.metadata.format).toBe('csv');
  });

  it('parses TSV', () => {
    const input = `Name\tAge\tCity
Alice\t30\tNew York
Bob\t25\tLondon`;

    const table = parseTable(input, 'tsv');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows).toEqual([
      ['Alice', '30', 'New York'],
      ['Bob', '25', 'London'],
    ]);
    expect(table.metadata.format).toBe('tsv');
  });

  it('handles quoted fields', () => {
    const input = `Name,Description,Price
"Widget, Large","A ""special"" item",$49.99`;

    const table = parseTable(input, 'csv');
    expect(table.rows[0][0]).toBe('Widget, Large');
    expect(table.rows[0][1]).toBe('A "special" item');
    expect(table.rows[0][2]).toBe('$49.99');
  });

  it('handles newlines in quoted fields', () => {
    const input = `Name,Description
"Alice","Line 1
Line 2"`;

    const table = parseTable(input, 'csv');
    expect(table.rows[0][0]).toBe('Alice');
    expect(table.rows[0][1]).toBe('Line 1\nLine 2');
  });

  it('handles empty fields', () => {
    const input = `A,B,C
1,,3
,2,`;

    const table = parseTable(input, 'csv');
    expect(table.rows[0]).toEqual(['1', '', '3']);
    expect(table.rows[1]).toEqual(['', '2', '']);
  });

  it('auto-detects header row (non-numeric values)', () => {
    const input = `Name,Age,City
Alice,30,New York`;

    const table = parseTable(input, 'csv');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.metadata.inferredHeaders).toBe(false);
  });

  it('generates synthetic headers when all values are numeric', () => {
    const input = `1,2,3
4,5,6
7,8,9`;

    const table = parseTable(input, 'csv');
    expect(table.headers).toEqual(['Column 1', 'Column 2', 'Column 3']);
    expect(table.metadata.inferredHeaders).toBe(true);
    expect(table.rows.length).toBe(3);
  });

  it('handles CRLF line endings', () => {
    const input = `Name,Age\r\nAlice,30\r\nBob,25`;

    const table = parseTable(input, 'csv');
    expect(table.rows.length).toBe(2);
    expect(table.rows[0]).toEqual(['Alice', '30']);
  });

  it('skips empty lines', () => {
    const input = `Name,Age
Alice,30

Bob,25`;

    const table = parseTable(input, 'csv');
    expect(table.rows.length).toBe(2);
  });

  it('pads rows with fewer columns', () => {
    const input = `A,B,C
1,2
3`;

    const table = parseTable(input, 'csv');
    expect(table.rows[0]).toEqual(['1', '2', '']);
    expect(table.rows[1]).toEqual(['3', '', '']);
  });

  it('handles semicolon delimiter', () => {
    const input = `Name;Age;City
Alice;30;New York
Bob;25;London`;

    // Auto-detect via csv format
    const table = parseTable(input, 'csv');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows[0]).toEqual(['Alice', '30', 'New York']);
  });

  it('handles single-column CSV', () => {
    const input = `Name
Alice
Bob`;

    const table = parseTable(input, 'csv');
    expect(table.headers).toEqual(['Name']);
    expect(table.rows.length).toBe(2);
  });

  it('handles empty CSV', () => {
    const input = '';
    const table = parseTable(input, 'csv');
    expect(table.rows).toEqual([]);
    expect(table.metadata.inferredHeaders).toBe(true);
  });
});

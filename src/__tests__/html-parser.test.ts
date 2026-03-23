import { describe, it, expect } from 'vitest';
import { parseTable } from '../index';

describe('HTML table parser', () => {
  it('parses a basic HTML table with thead/tbody', () => {
    const input = `<table>
      <thead>
        <tr><th>Name</th><th>Age</th><th>City</th></tr>
      </thead>
      <tbody>
        <tr><td>Alice</td><td>30</td><td>New York</td></tr>
        <tr><td>Bob</td><td>25</td><td>London</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['Name', 'Age', 'City']);
    expect(table.rows).toEqual([
      ['Alice', '30', 'New York'],
      ['Bob', '25', 'London'],
    ]);
    expect(table.metadata.format).toBe('html');
    expect(table.metadata.rowCount).toBe(2);
    expect(table.metadata.columnCount).toBe(3);
  });

  it('parses a table without thead (th-based headers)', () => {
    const input = `<table>
      <tr><th>Product</th><th>Price</th></tr>
      <tr><td>Widget</td><td>$49</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['Product', 'Price']);
    expect(table.rows).toEqual([['Widget', '$49']]);
  });

  it('parses a table with no th elements (uses first row as header)', () => {
    const input = `<table>
      <tr><td>Name</td><td>Age</td></tr>
      <tr><td>Alice</td><td>30</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['Name', 'Age']);
    expect(table.rows).toEqual([['Alice', '30']]);
  });

  it('handles colspan', () => {
    const input = `<table>
      <tr><th>Name</th><th colspan="2">Details</th></tr>
      <tr><td>Alice</td><td>30</td><td>NY</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers.length).toBe(3);
    // colspan=2 means "Details" spans 2 columns
    expect(table.headers).toEqual(['Name', 'Details', 'Details']);
    expect(table.metadata.hadMergedCells).toBe(true);
  });

  it('handles rowspan', () => {
    const input = `<table>
      <thead><tr><th>Category</th><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td rowspan="2">Fruits</td><td>Apple</td><td>$1</td></tr>
        <tr><td>Banana</td><td>$0.50</td></tr>
        <tr><td>Vegetables</td><td>Carrot</td><td>$0.75</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.rows[0]).toEqual(['Fruits', 'Apple', '$1']);
    expect(table.rows[1]).toEqual(['Fruits', 'Banana', '$0.50']);
    expect(table.rows[2]).toEqual(['Vegetables', 'Carrot', '$0.75']);
    expect(table.metadata.hadMergedCells).toBe(true);
  });

  it('handles combined rowspan and colspan', () => {
    const input = `<table>
      <thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead>
      <tbody>
        <tr><td rowspan="2" colspan="2">Merged</td><td>1</td><td>2</td></tr>
        <tr><td>3</td><td>4</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.rows[0]).toEqual(['Merged', 'Merged', '1', '2']);
    expect(table.rows[1]).toEqual(['Merged', 'Merged', '3', '4']);
  });

  it('strips HTML tags from cell content', () => {
    const input = `<table>
      <tr><th>Name</th><th>Notes</th></tr>
      <tr><td><b>Alice</b></td><td>Has <em>important</em> <a href="#">info</a></td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.rows[0][0]).toBe('Alice');
    expect(table.rows[0][1]).toBe('Has important info');
  });

  it('decodes HTML entities', () => {
    const input = `<table>
      <tr><th>Expr</th><th>Result</th></tr>
      <tr><td>a &amp; b</td><td>&lt;div&gt;</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.rows[0][0]).toBe('a & b');
    expect(table.rows[0][1]).toBe('<div>');
  });

  it('extracts caption', () => {
    const input = `<table>
      <caption>Employee Directory</caption>
      <tr><th>Name</th><th>Dept</th></tr>
      <tr><td>Alice</td><td>Eng</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.metadata.caption).toBe('Employee Directory');
  });

  it('extracts summary attribute', () => {
    const input = `<table summary="Product listing">
      <tr><th>Product</th><th>Price</th></tr>
      <tr><td>Widget</td><td>$49</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.metadata.htmlSummary).toBe('Product listing');
  });

  it('handles multi-level headers', () => {
    const input = `<table>
      <thead>
        <tr><th colspan="2">Q1</th><th colspan="2">Q2</th></tr>
        <tr><th>Revenue</th><th>Cost</th><th>Revenue</th><th>Cost</th></tr>
      </thead>
      <tbody>
        <tr><td>100</td><td>50</td><td>120</td><td>60</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['Q1 Revenue', 'Q1 Cost', 'Q2 Revenue', 'Q2 Cost']);
    expect(table.rows[0]).toEqual(['100', '50', '120', '60']);
    expect(table.metadata.originalHeaderLevels).toBeDefined();
  });

  it('handles empty table', () => {
    const input = `<table>
      <thead><tr><th>A</th><th>B</th></tr></thead>
      <tbody></tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['A', 'B']);
    expect(table.rows).toEqual([]);
  });

  it('handles tfoot rows', () => {
    const input = `<table>
      <thead><tr><th>Item</th><th>Price</th></tr></thead>
      <tbody>
        <tr><td>Widget</td><td>$49</td></tr>
      </tbody>
      <tfoot>
        <tr><td>Total</td><td>$49</td></tr>
      </tfoot>
    </table>`;

    const table = parseTable(input, 'html');
    // tfoot rows are appended to data rows
    expect(table.rows.length).toBe(2);
    expect(table.rows[1]).toEqual(['Total', '$49']);
  });

  it('throws when no table element found', () => {
    expect(() => parseTable('<div>no table here</div>', 'html')).toThrow();
  });

  it('handles br tags as spaces', () => {
    const input = `<table>
      <tr><th>Name</th></tr>
      <tr><td>First<br>Last</td></tr>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.rows[0][0]).toBe('First Last');
  });

  it('correctly slices data rows after single header row', () => {
    const input = `<table>
      <thead>
        <tr><th>A</th><th>B</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>2</td></tr>
        <tr><td>3</td><td>4</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    expect(table.headers).toEqual(['A', 'B']);
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]).toEqual(['1', '2']);
    expect(table.rows[1]).toEqual(['3', '4']);
  });

  it('correctly slices data rows after multi-level headers', () => {
    const input = `<table>
      <thead>
        <tr><th>Group</th><th>Group</th></tr>
        <tr><th>Sub A</th><th>Sub B</th></tr>
      </thead>
      <tbody>
        <tr><td>1</td><td>2</td></tr>
      </tbody>
    </table>`;

    const table = parseTable(input, 'html');
    // Multi-level headers should be flattened and data rows should not include header rows
    expect(table.rows).toHaveLength(1);
    expect(table.rows[0]).toEqual(['1', '2']);
  });
});

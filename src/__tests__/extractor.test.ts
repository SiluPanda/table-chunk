import { describe, it, expect } from 'vitest';
import { detectTables } from '../index';

describe('Table extractor', () => {
  it('detects a markdown table in a document', () => {
    const doc = `# Title

Some paragraph text.

| Name | Age |
| --- | --- |
| Alice | 30 |
| Bob | 25 |

More text after the table.`;

    const regions = detectTables(doc);
    expect(regions.length).toBe(1);
    expect(regions[0].format).toBe('markdown');
    expect(regions[0].estimatedColumns).toBe(2);
    expect(regions[0].estimatedRows).toBe(2);
    expect(regions[0].content).toBeDefined();
  });

  it('detects multiple markdown tables', () => {
    const doc = `# Tables

| A | B |
| --- | --- |
| 1 | 2 |

Some text.

| X | Y | Z |
| --- | --- | --- |
| a | b | c |
| d | e | f |`;

    const regions = detectTables(doc);
    expect(regions.length).toBe(2);
    expect(regions[0].estimatedColumns).toBe(2);
    expect(regions[1].estimatedColumns).toBe(3);
  });

  it('ignores tables inside code blocks', () => {
    const doc = `# Example

\`\`\`
| Not | A | Table |
| --- | --- | --- |
| this | is | code |
\`\`\`

| Real | Table |
| --- | --- |
| yes | data |`;

    const regions = detectTables(doc);
    expect(regions.length).toBe(1);
    expect(regions[0].estimatedColumns).toBe(2);
  });

  it('detects HTML tables', () => {
    const doc = `<html>
<body>
  <p>Some text</p>
  <table>
    <tr><th>Name</th><th>Age</th></tr>
    <tr><td>Alice</td><td>30</td></tr>
  </table>
  <p>More text</p>
</body>
</html>`;

    const regions = detectTables(doc, 'html');
    expect(regions.length).toBe(1);
    expect(regions[0].format).toBe('html');
    expect(regions[0].startOffset).toBeDefined();
    expect(regions[0].endOffset).toBeDefined();
  });

  it('detects multiple HTML tables', () => {
    const doc = `<table><tr><td>A</td></tr></table>
<p>text</p>
<table><tr><td>B</td></tr></table>`;

    const regions = detectTables(doc, 'html');
    expect(regions.length).toBe(2);
  });

  it('handles mixed markdown and HTML tables in auto mode', () => {
    const doc = `# Document

| Md | Table |
| --- | --- |
| 1 | 2 |

<table><tr><th>Html</th><th>Table</th></tr><tr><td>a</td><td>b</td></tr></table>`;

    const regions = detectTables(doc);
    expect(regions.length).toBe(2);
  });

  it('returns empty array for document with no tables', () => {
    const doc = `Just some text. No tables here.
Another line.`;

    const regions = detectTables(doc);
    expect(regions.length).toBe(0);
  });

  it('extracts content for markdown tables', () => {
    const doc = `Text before.

| H1 | H2 |
| --- | --- |
| v1 | v2 |

Text after.`;

    const regions = detectTables(doc);
    expect(regions[0].content).toContain('H1');
    expect(regions[0].content).toContain('v1');
  });

  it('extracts content for HTML tables', () => {
    const doc = `<p>Before</p><table><tr><td>Cell</td></tr></table><p>After</p>`;

    const regions = detectTables(doc, 'html');
    expect(regions[0].content).toContain('<table>');
    expect(regions[0].content).toContain('Cell');
  });

  it('handles nested HTML tables', () => {
    const doc = `<table>
      <tr><td>
        <table><tr><td>Nested</td></tr></table>
      </td></tr>
    </table>`;

    const regions = detectTables(doc, 'html');
    // Outer table should be detected as one region
    expect(regions.length).toBe(1);
    expect(regions[0].content).toContain('Nested');
  });
});

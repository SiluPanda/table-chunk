import { describe, it, expect } from 'vitest';
import { serializeRow } from '../index';

describe('serializeRow', () => {
  const headers = ['Name', 'Age', 'City', 'Department'];
  const row = ['Alice Johnson', '30', 'New York', 'Engineering'];

  describe('key-value format', () => {
    it('produces key-value string', () => {
      const result = serializeRow(row, headers, { format: 'key-value' });
      expect(result).toBe('Name: Alice Johnson, Age: 30, City: New York, Department: Engineering');
    });

    it('skips empty cells by default', () => {
      const result = serializeRow(['Alice', '', 'New York', ''], headers, { format: 'key-value' });
      expect(result).toBe('Name: Alice, City: New York');
    });

    it('includes empty cells when configured', () => {
      const result = serializeRow(['Alice', '', 'New York', ''], headers, {
        format: 'key-value',
        includeEmptyCells: true,
      });
      expect(result).toBe('Name: Alice, Age: , City: New York, Department: ');
    });
  });

  describe('newline format', () => {
    it('produces one field per line', () => {
      const result = serializeRow(row, headers, { format: 'newline' });
      expect(result).toBe('Name: Alice Johnson\nAge: 30\nCity: New York\nDepartment: Engineering');
    });

    it('skips empty cells by default', () => {
      const result = serializeRow(['Alice', '', '', 'Eng'], headers, { format: 'newline' });
      expect(result).toBe('Name: Alice\nDepartment: Eng');
    });
  });

  describe('sentence format', () => {
    it('produces a sentence with subject from first column', () => {
      const result = serializeRow(row, headers, { format: 'sentence' });
      expect(result).toContain('Alice Johnson');
      expect(result).toContain('Age: 30');
      expect(result).toContain('City: New York');
      expect(result).toContain('Department: Engineering');
      expect(result).toMatch(/\.$/);

    });

    it('uses custom subject column', () => {
      const result = serializeRow(row, headers, {
        format: 'sentence',
        sentenceSubjectColumn: 2,
      });
      expect(result).toMatch(/^New York/);
    });

    it('handles single non-subject column', () => {
      const result = serializeRow(['Alice', '30'], ['Name', 'Age'], {
        format: 'sentence',
      });
      expect(result).toBe('Alice, Age: 30.');
    });

    it('handles subject only', () => {
      const result = serializeRow(['Alice'], ['Name'], { format: 'sentence' });
      expect(result).toBe('Alice.');
    });
  });

  describe('template format', () => {
    it('replaces placeholders with values', () => {
      const result = serializeRow(
        ['Widget A', 'W-001', '$49.99', '240'],
        ['Product', 'SKU', 'Price', 'Stock'],
        {
          format: 'template',
          template: '{{Product}} ({{SKU}}) is priced at {{Price}} with {{Stock}} units available.',
        }
      );
      expect(result).toBe('Widget A (W-001) is priced at $49.99 with 240 units available.');
    });

    it('is case-insensitive by default', () => {
      const result = serializeRow(
        ['Alice'],
        ['Name'],
        {
          format: 'template',
          template: '{{name}} is here.',
        }
      );
      expect(result).toBe('Alice is here.');
    });

    it('respects case-sensitive mode', () => {
      const result = serializeRow(
        ['Alice'],
        ['Name'],
        {
          format: 'template',
          template: '{{name}} is here.',
          templateCaseSensitive: true,
        }
      );
      expect(result).toBe('{{name}} is here.');
    });

    it('leaves unmatched placeholders by default', () => {
      const result = serializeRow(
        ['Alice'],
        ['Name'],
        {
          format: 'template',
          template: '{{Name}} {{Missing}}',
        }
      );
      expect(result).toBe('Alice {{Missing}}');
    });

    it('removes unmatched placeholders when configured', () => {
      const result = serializeRow(
        ['Alice'],
        ['Name'],
        {
          format: 'template',
          template: '{{Name}} {{Missing}}',
          removeMissingPlaceholders: true,
        }
      );
      expect(result).toBe('Alice ');
    });
  });

  describe('edge cases', () => {
    it('handles empty row', () => {
      const result = serializeRow([], [], { format: 'key-value' });
      expect(result).toBe('');
    });

    it('handles row shorter than headers', () => {
      const result = serializeRow(['Alice'], ['Name', 'Age', 'City'], { format: 'key-value' });
      expect(result).toBe('Name: Alice');
    });

    it('defaults to key-value when no format specified', () => {
      const result = serializeRow(row, headers);
      expect(result).toBe('Name: Alice Johnson, Age: 30, City: New York, Department: Engineering');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { csvEscape, toCSV, parseCSV } from '../lib/csv';

describe('csv', () => {
  it('csvEscape quotes when needed and escapes quotes', () => {
    expect(csvEscape('plain')).toBe('plain');
    expect(csvEscape('needs,quote')).toBe('"needs,quote"');
    expect(csvEscape('"q"')).toBe('"""q"""');
    expect(csvEscape(' spaced ')).toBe('" spaced "');
  });

  it('toCSV builds simple csv from headers and rows', () => {
    const headers = ['a', 'b'];
    const rows = [{ a: '1', b: '2' }, { a: 'x,y', b: 'z' }];
    const out = toCSV(headers, rows);
    expect(out).toBe('a,b\n1,2\n"x,y",z');
  });

  it('parseCSV parses quoted fields and escapes', () => {
    const text = 'a,b\n1,2\n"x,\"y\"",z';
    const { headers, rows } = parseCSV(text);
    expect(headers).toEqual(['a', 'b']);
    expect(rows).toEqual([
      ['1', '2'],
      ['x,"y"', 'z'],
    ]);
  });
});


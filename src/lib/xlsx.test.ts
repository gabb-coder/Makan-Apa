import { describe, expect, it } from 'vitest';
import { columnName, csv, excelDate, xlsx, zip, type Sheet } from './xlsx';

const sheet: Sheet = {
  name: 'Lunch gang',
  columns: [
    { header: 'Date', width: 12 },
    { header: 'Food', width: 20 },
    { header: 'Count', width: 8 },
  ],
  rows: [
    [{ date: '2026-10-31' }, 'Nasi Lemak, extra sambal', 2],
    [{ date: '2026-11-01' }, 'Say "cheese" & <pizza>', null],
  ],
};

describe('xlsx helpers', () => {
  it('names columns like a spreadsheet', () => {
    expect([0, 1, 25, 26, 27, 701, 702].map(columnName)).toEqual(['A', 'B', 'Z', 'AA', 'AB', 'ZZ', 'AAA']);
  });

  it('converts dates to Excel day numbers', () => {
    expect(excelDate('1900-03-01')).toBe(61);
    expect(excelDate('2026-10-31')).toBe(46326);
  });

  it('writes a zip with the workbook parts', () => {
    const bytes = xlsx(sheet);
    expect([...bytes.slice(0, 4)]).toEqual([0x50, 0x4b, 0x03, 0x04]);
    const text = new TextDecoder().decode(bytes);
    expect(text).toContain('xl/worksheets/sheet1.xml');
    expect(text).toContain('Say &quot;cheese&quot; &amp; &lt;pizza&gt;');
    expect(text).toContain('<c r="A2" s="2"><v>46326</v></c>');
    expect(text).toContain('<autoFilter ref="A1:C3"/>');
  });

  it('records sizes and CRCs a zip reader can check', () => {
    const data = new TextEncoder().encode('hello');
    const z = zip([['a.txt', data]]);
    const view = new DataView(z.buffer);
    expect(view.getUint32(14, true)).toBe(0x3610a686); // CRC-32 of "hello"
    expect(view.getUint32(18, true)).toBe(5);
    expect(view.getUint32(z.length - 22, true)).toBe(0x06054b50);
  });
});

describe('csv', () => {
  it('quotes commas and quotes, and starts with a BOM for Excel', () => {
    const out = csv(sheet);
    expect(out.startsWith('﻿Date,Food,Count\r\n')).toBe(true);
    expect(out).toContain('2026-10-31,"Nasi Lemak, extra sambal",2\r\n');
    expect(out).toContain('2026-11-01,"Say ""cheese"" & <pizza>",\r\n');
  });
});

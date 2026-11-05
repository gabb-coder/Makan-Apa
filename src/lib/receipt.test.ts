import { describe, expect, it } from 'vitest';
import { parseReceipt } from './receipt';

const MAMAK = `RESTORAN PELITA SUNWAY
Jalan PJS 11/28, Bandar Sunway
SST ID: W10-1808-31000123

Inv No: 0012345 05/11/2026 12:41
Table: 12 Cashier: AMIRA
QTY ITEM AMOUNT
1 Nasi Lemak Ayam 12.50
2 Teh Tarik Ais 7.00
1 Roti Canai Telur 3.50
1 Mee Goreng Mamak 9.90
Sub Total 32.90
Service Charge 10% 3.29
SST 6% 2.17
Rounding -0.01
TOTAL 38.35
Cash 50.00
Change 11.65
THANK YOU, PLEASE COME AGAIN`;

describe('reading a receipt', () => {
  it('finds the items, splits portions, and reads the charges and totals', () => {
    const r = parseReceipt(MAMAK);
    expect(r.items).toEqual([
      { name: 'Nasi Lemak Ayam', cents: 1250 },
      { name: 'Teh Tarik Ais', cents: 350 },
      { name: 'Teh Tarik Ais', cents: 350 },
      { name: 'Roti Canai Telur', cents: 350 },
      { name: 'Mee Goreng Mamak', cents: 990 },
    ]);
    expect(r.subtotal).toBe(3290);
    expect(r.total).toBe(3835);
    expect(r.servicePct).toBe(10);
    expect(r.sstPct).toBe(6);
  });

  it('copes with OCR slips, RM prefixes, decimal commas, codes and unit prices', () => {
    const r = parseReceipt(`Chicken Rice RM 1O.5O
Iced Lemon Tea 4,50 SR
2 x Kopi O Peng 2.80 5.60
*Laksa 13.9O
Total Qty: 5
Sub-Total 34.50`);
    expect(r.items.map((i) => [i.name, i.cents])).toEqual([
      ['Chicken Rice', 1050],
      ['Iced Lemon Tea', 450],
      ['Kopi O Peng', 280],
      ['Kopi O Peng', 280],
      ['Laksa', 1390],
    ]);
    expect(r.subtotal).toBe(3450);
  });

  it('works out the percentages when only amounts are printed, and treats "Service Tax" as SST', () => {
    const r = parseReceipt(`Pizza 40.00
Pasta 20.00
Svc Chg 6.00
Service Tax 3.96
Grand Total 69.96`);
    expect(r.servicePct).toBe(10);
    expect(r.sstPct).toBe(6);
    expect(r.total).toBe(6996);
    expect(r.items).toHaveLength(2);
  });

  it('ignores payment lines and anything after the total', () => {
    const r = parseReceipt(`Nasi Kandar 15.00
TOTAL 15.00
VISA 15.00
Points earned 1.50`);
    expect(r.items).toEqual([{ name: 'Nasi Kandar', cents: 1500 }]);
  });

  it('gives nothing back for text that isn’t a receipt', () => {
    expect(parseReceipt('hello there\nno prices here').items).toEqual([]);
  });
});

/** Who paid for meals and who owes whom, in sen (1/100 ringgit) to stay exact. */

export interface Bill {
  paid_by: string;
  amount_cents: number;
  split_between: string[];
}

export interface Payment {
  from_member: string;
  to_member: string;
  amount_cents: number;
}

/** "RM12.50" */
export function formatRM(cents: number): string {
  return `RM${(Math.abs(cents) / 100).toFixed(2)}`;
}

/** "12.5" or "RM 12.50" typed by someone → 1250, or null if it isn't a positive amount. */
export function parseRM(text: string): number | null {
  const cleaned = text.replace(/rm/i, '').replace(/,/g, '').trim();
  if (!/^\d+(\.\d{0,2})?$/.test(cleaned)) return null;
  const cents = Math.round(Number(cleaned) * 100);
  return cents > 0 && cents <= 10_000_000 ? cents : null;
}

/** Each person's share of a bill; leftover sen go to the first people so it adds up exactly. */
export function shares(bill: Bill): Map<string, number> {
  const people = [...new Set(bill.split_between)];
  const base = Math.floor(bill.amount_cents / people.length);
  let left = bill.amount_cents - base * people.length;
  return new Map(people.map((id) => [id, base + (left-- > 0 ? 1 : 0)]));
}

/** Net position per member: positive means the room owes them, negative means they owe. */
export function balances(bills: Bill[], payments: Payment[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);
  for (const bill of bills) {
    add(bill.paid_by, bill.amount_cents);
    for (const [id, share] of shares(bill)) add(id, -share);
  }
  for (const p of payments) {
    add(p.from_member, p.amount_cents);
    add(p.to_member, -p.amount_cents);
  }
  return net;
}

/** The fewest simple payments that settle everyone up: biggest debtor pays biggest creditor. */
export function settleUp(net: Map<string, number>): Payment[] {
  const owes = [...net].filter(([, c]) => c < 0).map(([id, c]) => ({ id, c: -c }));
  const owed = [...net].filter(([, c]) => c > 0).map(([id, c]) => ({ id, c }));
  const out: Payment[] = [];
  owes.sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  owed.sort((a, b) => b.c - a.c || a.id.localeCompare(b.id));
  let i = 0;
  let j = 0;
  while (i < owes.length && j < owed.length) {
    const amount = Math.min(owes[i].c, owed[j].c);
    if (amount > 0) out.push({ from_member: owes[i].id, to_member: owed[j].id, amount_cents: amount });
    owes[i].c -= amount;
    owed[j].c -= amount;
    if (owes[i].c === 0) i++;
    if (owed[j].c === 0) j++;
  }
  return out;
}

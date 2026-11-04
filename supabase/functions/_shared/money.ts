// Copy of src/lib/money.ts for the Edge Functions (Deno can't reach src/). Kept identical by
// src/lib/notify.test.ts; edit src/lib/money.ts and copy it here.
/** Who paid for meals and who owes whom, in sen (1/100 ringgit) to stay exact. */

/** One line of an itemised bill: its price is shared equally between its people. */
export interface BillItem {
  name: string;
  cents: number;
  people: string[];
}

export interface Bill {
  paid_by: string;
  /** The final total, service charge and SST included. */
  amount_cents: number;
  split_between: string[];
  /** Itemised bills only; without items the total is split equally between split_between. */
  items?: BillItem[] | null;
  service_pct?: number | string | null;
  sst_pct?: number | string | null;
  /** Paid out of the room's kitty: everyone's share comes off their kitty balance, not a debt. */
  from_kitty?: boolean | null;
  /** The payer's treat: nobody owes anything for it. */
  treat?: boolean | null;
  /** Whose birthday it is: their share is spread over everyone else. */
  birthday?: string | null;
}

/**
 * A guest someone brought (not on the app) is "<their member id>+<n>" on a bill's items; what the
 * guest had is charged to whoever brought them.
 */
export function guestKey(hostId: string, n: number): string {
  return `${hostId}+${n}`;
}
export function guestHost(id: string): string {
  const i = id.indexOf('+');
  return i === -1 ? id : id.slice(0, i);
}
export function isGuest(id: string): boolean {
  return id.includes('+');
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

/** Splits an amount equally; leftover sen go to the first people so it adds up exactly. */
function evenly(cents: number, ids: string[]): Map<string, number> {
  const people = [...new Set(ids)];
  if (!people.length) return new Map();
  const base = Math.floor(cents / people.length);
  let left = cents - base * people.length;
  return new Map(people.map((id) => [id, base + (left-- > 0 ? 1 : 0)]));
}

/**
 * Splits `total` in proportion to `weights`, exact to the sen: everyone gets their rounded-down
 * part, then the leftover sen go to the biggest remainders.
 */
export function allocate(total: number, weights: Map<string, number>): Map<string, number> {
  const entries = [...weights].filter(([, w]) => w > 0);
  const sum = entries.reduce((n, [, w]) => n + w, 0);
  if (!sum) return new Map();
  const parts = entries.map(([id, w], i) => {
    const exact = (total * w) / sum;
    return { id, i, cents: Math.floor(exact), rest: exact - Math.floor(exact) };
  });
  let left = total - parts.reduce((n, p) => n + p.cents, 0);
  for (const p of [...parts].sort((a, b) => b.rest - a.rest || a.i - b.i)) {
    if (left <= 0) break;
    p.cents++;
    left--;
  }
  return new Map(parts.map((p) => [p.id, p.cents]));
}

/** Malaysian receipts: service charge on the subtotal, then SST on subtotal plus service. */
export function billTotals(items: BillItem[], servicePct: number, sstPct: number) {
  const subtotal = items.reduce((n, item) => n + item.cents, 0);
  const service = Math.round((subtotal * servicePct) / 100);
  const sst = Math.round(((subtotal + service) * sstPct) / 100);
  return { subtotal, service, sst, total: subtotal + service + sst };
}

/** What each person had before charges: their own items plus their part of shared ones. */
export function itemSubtotals(items: BillItem[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const item of items) {
    for (const [id, cents] of evenly(item.cents, item.people)) out.set(id, (out.get(id) ?? 0) + cents);
  }
  return out;
}

/**
 * Each person's share of a bill. Itemised bills share the total (charges included) in
 * proportion to what each person had; older bills split it equally.
 */
export function shares(bill: Bill): Map<string, number> {
  let raw: Map<string, number> | null = null;
  if (bill.items?.length) {
    const subs = itemSubtotals(bill.items);
    if (subs.size) raw = allocate(bill.amount_cents, subs);
  }
  raw ??= evenly(bill.amount_cents, bill.split_between);
  // Guests' shares go to whoever brought them.
  const out = new Map<string, number>();
  for (const [id, cents] of raw) out.set(guestHost(id), (out.get(guestHost(id)) ?? 0) + cents);
  // Birthday: their share is spread over everyone else, in proportion to what they had.
  const bday = bill.birthday;
  if (bday && out.has(bday) && out.size > 1) {
    const theirs = out.get(bday)!;
    out.delete(bday);
    const others = [...out.values()].some((c) => c > 0) ? new Map(out) : new Map([...out.keys()].map((id) => [id, 1]));
    for (const [id, cents] of allocate(theirs, others)) out.set(id, (out.get(id) ?? 0) + cents);
    out.set(bday, 0);
  }
  return out;
}

/** "6", "6.5" or "" typed as a percentage → a number between 0 and 30, or null. */
export function parsePct(text: string): number | null {
  const cleaned = text.replace('%', '').trim();
  if (cleaned === '') return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return n <= 30 ? n : null;
}

/** Net position per member: positive means the room owes them, negative means they owe. */
export function balances(bills: Bill[], payments: Payment[]): Map<string, number> {
  const net = new Map<string, number>();
  const add = (id: string, cents: number) => net.set(id, (net.get(id) ?? 0) + cents);
  for (const bill of bills) {
    if (bill.from_kitty || bill.treat) continue;
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

export interface TopUp {
  member_id: string;
  amount_cents: number;
}

/**
 * The kitty: what's left in it, and each person's part of that (what they put in minus their
 * shares of the bills it paid). A negative part means they've eaten more than they put in.
 */
export function kitty(bills: Bill[], topUps: TopUp[]): { total: number; each: Map<string, number> } {
  const each = new Map<string, number>();
  const add = (id: string, cents: number) => each.set(id, (each.get(id) ?? 0) + cents);
  let total = 0;
  for (const t of topUps) {
    add(t.member_id, t.amount_cents);
    total += t.amount_cents;
  }
  for (const bill of bills) {
    if (!bill.from_kitty) continue;
    total -= bill.amount_cents;
    for (const [id, share] of shares(bill)) add(id, -share);
  }
  return { total, each };
}

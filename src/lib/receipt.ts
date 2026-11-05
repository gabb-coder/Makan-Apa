/**
 * Turns the text read off a receipt photo into bill lines, plus the service charge and SST.
 * Receipts vary a lot and the text comes from OCR, so this is forgiving: any line that ends in a
 * price is a candidate, and keywords sort out the totals, charges and payment lines.
 */

export interface ScannedItem {
  name: string;
  cents: number;
}

export interface ScannedReceipt {
  /** One per portion: "2 Teh Tarik 7.00" becomes two lines of 3.50, so different people can tick them. */
  items: ScannedItem[];
  /** Percentages, when the receipt shows a service charge or SST. */
  servicePct: number | null;
  sstPct: number | null;
  subtotal: number | null;
  total: number | null;
}

// A price at the end of a line: "12.50", "RM 12.50", "12,50", "-0.03", maybe with a tax code after it.
const PRICE_AT_END = /(-)?\s*(?:RM\s*)?(\d{1,5}(?:,\d{3})*[.,]\s?\d{2})\s*(?:[A-Z]{1,2}|\*)?\s*$/i;
const PRICE_ANYWHERE = /(?:RM\s*)?\d{1,5}[.,]\d{2}\b/gi;

const SUBTOTAL = /\bsub\s*-?\s*total|\bsubtotal|\bjumlah\s*kecil/i;
const TOTAL = /\b(?:grand\s*)?total\b|\bjumlah\b|\bamount\s*due\b|\bnett?\s*(?:total|amount)?\b|\bto\s*pay\b/i;
// Malaysian F&B receipts say "Service Tax" for SST, so it's checked before the service charge.
const SST = /\b(?:sst|gst|service\s*tax|sales\s*tax|tax|cukai)\b/i;
const SERVICE = /\bserv(?:ice)?\.?\s*(?:charge|chg|chrg|crg|ch)?\b|\bsvc\b|\bs\/c\b|\bcaj\s*perkhidmatan\b/i;
const SKIP =
  /\b(?:rounding|round\s*adj|adj(?:ustment)?|cash|change|tender(?:ed)?|card|visa|master(?:card)?|amex|debit|credit|paid|payment|balance|baki|tunai|discount|disc|voucher|deposit|points?|tips?|e-?wallet|tng|grab\s*pay|boost|duitnow|qr\s*pay|tel|phone|fax|inv(?:oice)?|receipt|bill\s*no|table|pax|cashier|date|time|qty|item|amount)\b/i;

/** "12,50" or "1,234.50" or "12. 50" → cents. */
function toCents(raw: string): number {
  const s = raw.replace(/\s/g, '');
  // A comma followed by exactly two digits at the end is a decimal comma.
  const normal = /,\d{2}$/.test(s) && !s.includes('.') ? s.replace(',', '.') : s.replace(/,/g, '');
  return Math.round(Number(normal) * 100);
}

/** OCR often reads 0 as O and 1 as l, I or | inside prices: fix them, but only inside a price. */
function fixDigits(line: string): string {
  return line.replace(/(?<![A-Za-z])[\dOoIl|]{1,5}[.,]\s?[\dOo]{2}(?![A-Za-z\d])/g, (tok) => (/\d/.test(tok) ? tok.replace(/[Oo]/g, '0').replace(/[Il|]/g, '1') : tok));
}

function percentIn(line: string): number | null {
  const m = line.match(/(\d{1,2}(?:[.,]\d{1,2})?)\s*%/);
  if (!m) return null;
  const n = Number(m[1].replace(',', '.'));
  return n > 0 && n <= 30 ? n : null;
}

/** 9.98 → 10, 6.02 → 6: rounding on the receipt shouldn't show up as an odd percentage. */
function snapPct(n: number): number {
  for (const common of [5, 6, 8, 10, 12, 15]) if (Math.abs(n - common) <= 0.35) return common;
  return Math.round(n * 10) / 10;
}

/** "2 x Teh Tarik", "Teh Tarik x2", "2 Teh Tarik 3.50": the quantity and the cleaned-up name. */
function nameAndQty(text: string): { name: string; qty: number } {
  let s = text.replace(PRICE_ANYWHERE, ' ').replace(/\s+/g, ' ').trim();
  let qty = 1;
  const lead = s.match(/^(\d{1,2})\s*[xX×*]?\s+(?=\D)/);
  if (lead) {
    qty = Number(lead[1]);
    s = s.slice(lead[0].length);
  } else {
    const trail = s.match(/\s+[xX×*]\s*(\d{1,2})$|\s+(\d{1,2})\s*[xX×]$/);
    if (trail) {
      qty = Number(trail[1] ?? trail[2]);
      s = s.slice(0, trail.index);
    }
  }
  // Item codes and stray symbols at either end.
  s = s.replace(/^[^A-Za-zÀ-ɏ一-鿿]+/, '').replace(/[^A-Za-z0-9)À-ɏ一-鿿]+$/, '');
  return { name: s.slice(0, 40), qty: qty >= 1 && qty <= 20 ? qty : 1 };
}

export function parseReceipt(text: string): ScannedReceipt {
  const out: ScannedReceipt = { items: [], servicePct: null, sstPct: null, subtotal: null, total: null };
  let serviceCents: number | null = null;
  let sstCents: number | null = null;
  // Items come before the totals; anything after the first total line isn't food.
  let pastItems = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = fixDigits(rawLine.trim());
    if (!line) continue;
    const m = line.match(PRICE_AT_END);
    if (!m) continue;
    const cents = toCents(m[2]) * (m[1] ? -1 : 1);
    const label = line.slice(0, m.index).trim();
    if (!Number.isFinite(cents)) continue;

    if (SUBTOTAL.test(label)) {
      out.subtotal ??= cents;
      pastItems = true;
    } else if (SST.test(label) && !/\bid\b|\breg/i.test(label)) {
      sstCents ??= cents;
      out.sstPct ??= percentIn(label);
      pastItems = true;
    } else if (SERVICE.test(label)) {
      serviceCents ??= cents;
      out.servicePct ??= percentIn(label);
      pastItems = true;
    } else if (TOTAL.test(label)) {
      // The first total after the items; "Total qty: 5" has no price, so it never gets here.
      if (out.total === null && cents > 0) out.total = cents;
      pastItems = true;
    } else if (SKIP.test(label)) {
      continue;
    } else if (!pastItems && cents > 0 && cents <= 1_000_000) {
      const { name, qty } = nameAndQty(label);
      // A name needs at least two letters; otherwise it's a stray number or code.
      if ((name.match(/[A-Za-zÀ-ɏ一-鿿]/g) ?? []).length < 2) continue;
      if (qty > 1 && qty <= 8) {
        // Split into portions, the leftover sen going to the first ones.
        const base = Math.floor(cents / qty);
        let left = cents - base * qty;
        for (let k = 0; k < qty; k++) out.items.push({ name, cents: base + (left-- > 0 ? 1 : 0) });
      } else {
        out.items.push({ name, cents });
      }
    }
  }

  const itemsSum = out.items.reduce((n, i) => n + i.cents, 0);
  const base = out.subtotal ?? itemsSum;
  // No percentage printed: work it out from the amount.
  if (out.servicePct === null && serviceCents && base > 0) out.servicePct = snapPct((serviceCents / base) * 100);
  if (out.sstPct === null && sstCents && base > 0) out.sstPct = snapPct((sstCents / (base + (serviceCents ?? 0))) * 100);
  if (out.servicePct !== null && (out.servicePct <= 0 || out.servicePct > 30)) out.servicePct = null;
  if (out.sstPct !== null && (out.sstPct <= 0 || out.sstPct > 30)) out.sstPct = null;
  return out;
}

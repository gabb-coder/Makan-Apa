import type { FoodDraft } from './foods';
import { COLOR_KEYS, ICONS } from './palette';

/** Where a shared list waits on this phone until a room is open to add it to. */
export const PENDING_FOODS_KEY = 'makan.importFoods';

const MAX = 60;

type Packed = { n: string; t?: string[]; i?: string; c?: string; d?: string[]; p?: number | null };

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0)));
}

/** A food list packed small enough for a link. */
export function encodeFoods(foods: FoodDraft[]): string {
  const packed: Packed[] = foods.slice(0, MAX).map((f) => ({ n: f.name, t: f.tags, i: f.icon, c: f.color, d: f.diet?.length ? f.diet : undefined, p: f.price ?? undefined }));
  return toBase64Url(JSON.stringify(packed));
}

/** The foods in a shared link, checked and cleaned; null if it isn't one. */
export function decodeFoods(s: string | null | undefined): FoodDraft[] | null {
  if (!s) return null;
  try {
    const list = JSON.parse(fromBase64Url(s)) as Packed[];
    if (!Array.isArray(list)) return null;
    const foods = list
      .filter((x) => x && typeof x.n === 'string' && x.n.trim())
      .slice(0, MAX)
      .map(
        (x): FoodDraft => ({
          name: x.n.trim().slice(0, 40),
          tags: Array.isArray(x.t) ? x.t.filter((tag) => typeof tag === 'string').slice(0, 8).map((tag) => tag.slice(0, 24)) : [],
          icon: (ICONS as readonly string[]).includes(x.i ?? '') ? (x.i as FoodDraft['icon']) : 'rice',
          color: (COLOR_KEYS as readonly string[]).includes(x.c ?? '') ? (x.c as FoodDraft['color']) : 'leaf',
          diet: Array.isArray(x.d) ? x.d.filter((m) => ['pork', 'beef', 'vegetarian', 'halal'].includes(m)) : [],
          price: typeof x.p === 'number' && x.p >= 1 && x.p <= 3 ? x.p : null,
        }),
      );
    return foods.length ? foods : null;
  } catch {
    return null;
  }
}

/** A link that opens the app and offers to add these foods to a room. */
export function foodsLink(foods: FoodDraft[]): string {
  return `${window.location.origin}/?foods=${encodeFoods(foods)}`;
}

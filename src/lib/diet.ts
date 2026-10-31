/**
 * What people in a room need, and whether a food or spot suits them. Foods only clash when
 * they're marked: an unmarked food is assumed fine, except for vegetarians, who need a food
 * marked vegetarian.
 */

export type MemberNeed = 'halal' | 'no-pork' | 'no-beef' | 'vegetarian';
export type FoodMark = 'halal' | 'pork' | 'beef' | 'vegetarian';
/** 1 under RM15, 2 RM15–50, 3 more (the same bands as the Sunway spots). */
export type Price = 1 | 2 | 3;

export const MEMBER_NEEDS: { key: MemberNeed; label: string }[] = [
  { key: 'halal', label: 'Halal' },
  { key: 'no-pork', label: 'No pork' },
  { key: 'no-beef', label: 'No beef' },
  { key: 'vegetarian', label: 'Vegetarian' },
];

export const FOOD_MARKS: { key: FoodMark; label: string }[] = [
  { key: 'halal', label: 'Halal' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'pork', label: 'Has pork' },
  { key: 'beef', label: 'Has beef' },
];

export const BUDGETS: { value: Price | null; label: string }[] = [
  { value: null, label: 'Any' },
  { value: 1, label: 'Under RM15' },
  { value: 2, label: 'Under RM50' },
];

export const PRICES: { value: Price | null; label: string }[] = [
  { value: null, label: 'Not sure' },
  { value: 1, label: 'Under RM15' },
  { value: 2, label: 'RM15–50' },
  { value: 3, label: 'RM50+' },
];

export interface Needs {
  diet: string[];
  budget: number | null;
}

export interface Suitability {
  diet: string[];
  price: number | null;
}

/** Why a food doesn't suit someone, or [] if it does. */
export function clashes(food: Suitability, person: Needs): string[] {
  const reasons: string[] = [];
  const has = (m: FoodMark) => food.diet.includes(m);
  if ((person.diet.includes('halal') || person.diet.includes('no-pork')) && has('pork')) reasons.push(person.diet.includes('halal') ? 'halal' : 'no pork');
  if (person.diet.includes('no-beef') && has('beef')) reasons.push('no beef');
  if (person.diet.includes('vegetarian') && !has('vegetarian')) reasons.push('vegetarian');
  if (person.budget && food.price && food.price > person.budget) reasons.push('budget');
  return reasons;
}

/** The people a food doesn't suit, with why. */
export function whoClashes<M extends Needs & { name: string }>(food: Suitability, members: M[]): { member: M; reasons: string[] }[] {
  return members.map((member) => ({ member, reasons: clashes(food, member) })).filter((x) => x.reasons.length > 0);
}

export function suitsEveryone(food: Suitability, members: Needs[]): boolean {
  return members.every((m) => clashes(food, m).length === 0);
}

/** "Not for Alex (halal)", "Not for Alex and Wei". */
export function clashText(found: { member: { name: string }; reasons: string[] }[]): string | null {
  if (!found.length) return null;
  if (found.length === 1) return `Not for ${found[0].member.name} (${found[0].reasons.join(', ')})`;
  const names = found.map((f) => f.member.name);
  return `Not for ${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Halal · Under RM15" for someone's needs, or null if they have none. */
export function needsLabel(person: Needs): string | null {
  const parts = MEMBER_NEEDS.filter((n) => person.diet.includes(n.key)).map((n) => n.label);
  const budget = BUDGETS.find((b) => b.value === person.budget && b.value !== null);
  if (budget) parts.push(budget.label);
  return parts.length ? parts.join(' · ') : null;
}

/** A Sunway or room spot as food marks: a spot marked halal or pork, and its price band. */
export function spotSuitability(spot: { diet?: 'halal' | 'pork' | null; price?: number | null }): Suitability {
  return { diet: spot.diet ? [spot.diet] : [], price: spot.price ?? null };
}

/**
 * What people in a room need, and whether a food or spot suits them. Foods only clash when
 * they're marked: an unmarked food is assumed fine, except for vegetarians, who need a food
 * marked vegetarian.
 */
import { joinNames } from './foods';
import { getLang, t, tk } from './i18n';

export type MemberNeed = 'halal' | 'no-pork' | 'no-beef' | 'vegetarian';
export type FoodMark = 'halal' | 'pork' | 'beef' | 'vegetarian';
/** 1 under RM15, 2 RM15–50, 3 more (the same bands as the Sunway spots). */
export type Price = 1 | 2 | 3;

export const MEMBER_NEEDS: { key: MemberNeed; label: string }[] = [
  { key: 'halal', label: tk('Halal') },
  { key: 'no-pork', label: tk('No pork') },
  { key: 'no-beef', label: tk('No beef') },
  { key: 'vegetarian', label: tk('Vegetarian') },
];

export const FOOD_MARKS: { key: FoodMark; label: string }[] = [
  { key: 'halal', label: tk('Halal') },
  { key: 'vegetarian', label: tk('Vegetarian') },
  { key: 'pork', label: tk('Has pork') },
  { key: 'beef', label: tk('Has beef') },
];

export const BUDGETS: { value: Price | null; label: string }[] = [
  { value: null, label: tk('Any') },
  { value: 1, label: tk('Under RM15') },
  { value: 2, label: tk('Under RM50') },
];

export const PRICES: { value: Price | null; label: string }[] = [
  { value: null, label: tk('Not sure') },
  { value: 1, label: tk('Under RM15') },
  { value: 2, label: tk('RM15–50') },
  { value: 3, label: tk('RM50+') },
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
  if ((person.diet.includes('halal') || person.diet.includes('no-pork')) && has('pork')) reasons.push(person.diet.includes('halal') ? tk('halal') : tk('no pork'));
  if (person.diet.includes('no-beef') && has('beef')) reasons.push(tk('no beef'));
  if (person.diet.includes('vegetarian') && !has('vegetarian')) reasons.push(tk('vegetarian'));
  if (person.budget && food.price && food.price > person.budget) reasons.push(tk('budget'));
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
  if (found.length === 1) {
    const reasons = found[0].reasons.map((r) => t(r)).join(getLang() === 'zh' ? '、' : ', ');
    return t('Not for {name} ({reasons})', { name: found[0].member.name, reasons });
  }
  return t('Not for {names}', { names: joinNames(found.map((f) => f.member.name)) });
}

/** "Halal · Under RM15" for someone's needs, or null if they have none. */
export function needsLabel(person: Needs): string | null {
  const parts = MEMBER_NEEDS.filter((n) => person.diet.includes(n.key)).map((n) => t(n.label));
  const budget = BUDGETS.find((b) => b.value === person.budget && b.value !== null);
  if (budget) parts.push(t(budget.label));
  return parts.length ? parts.join(' · ') : null;
}

/** A Sunway or room spot as food marks: a spot marked halal or pork, and its price band. */
export function spotSuitability(spot: { diet?: 'halal' | 'pork' | null; price?: number | null }): Suitability {
  return { diet: spot.diet ? [spot.diet] : [], price: spot.price ?? null };
}

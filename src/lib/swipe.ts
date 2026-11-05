import type { SwipeRow } from './supabase';

export interface SwipeTally {
  /** Option index, its name, and how many said yes and no. */
  ranked: { index: number; name: string; yes: number; no: number; everyone: boolean }[];
  /** Who has swiped through every card this round. */
  finished: Set<string>;
  /** Everyone who's in has finished. */
  allDone: boolean;
}

/**
 * Swipe to match: the foods everyone who's in said yes to come first, then the most yeses, then
 * the order they were dealt in.
 */
export function tallySwipes(options: string[], swipes: SwipeRow[], round: number, voters: string[]): SwipeTally {
  const these = swipes.filter((s) => s.round === round && voters.includes(s.member_id) && s.choice < options.length);
  const finished = new Set(voters.filter((id) => new Set(these.filter((s) => s.member_id === id).map((s) => s.choice)).size >= options.length));
  const ranked = options
    .map((name, index) => {
      const on = these.filter((s) => s.choice === index);
      const yes = on.filter((s) => s.yes).length;
      return { index, name, yes, no: on.length - yes, everyone: voters.length > 0 && yes === voters.length };
    })
    .sort((a, b) => Number(b.everyone) - Number(a.everyone) || b.yes - a.yes || a.no - b.no || a.index - b.index);
  return { ranked, finished, allDone: voters.length > 0 && voters.every((id) => finished.has(id)) };
}

/** Deal `n` foods, favouring ones not eaten lately (like the wheel), in a random order. */
export function dealFoods<F extends { name: string }>(foods: F[], n: number, weight: (f: F) => number, random = Math.random): F[] {
  const pool = [...foods];
  const out: F[] = [];
  while (out.length < n && pool.length) {
    const total = pool.reduce((s, f) => s + Math.max(0.01, weight(f)), 0);
    let r = random() * total;
    let k = 0;
    for (; k < pool.length - 1; k++) {
      r -= Math.max(0.01, weight(pool[k]));
      if (r <= 0) break;
    }
    out.push(pool.splice(k, 1)[0]);
  }
  return out;
}

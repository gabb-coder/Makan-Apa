/**
 * A few dishes from each Sunway spot's menu, from its own menu, delivery listings (GrabFood,
 * foodpanda), reviews and food blogs (November 2026). Prices are what those sources listed, so
 * they're shown as approximate; null where no source gave one. Dish names stay as the shop
 * writes them, in every language.
 */
export interface MenuItem {
  name: string;
  /** Ringgit, as listed; approximate. */
  price: number | null;
}

export const SPOT_MENUS: Record<string, MenuItem[]> = {};

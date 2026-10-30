export const FOOD_COLORS = {
  leaf: { tile: '#DDEFD8', ink: '#2F6B2A', slice: '#A8D8A0' },
  mustard: { tile: '#FFF0C2', ink: '#8A5A00', slice: '#FFD966' },
  peach: { tile: '#FDE3CF', ink: '#9A4A12', slice: '#F6C59A' },
  tomato: { tile: '#FDDAD0', ink: '#A8330F', slice: '#FFB4A2' },
  sky: { tile: '#DCEAFB', ink: '#1F5596', slice: '#A9CDF4' },
  plum: { tile: '#F1E1F5', ink: '#7A3483', slice: '#DDBBE8' },
  sand: { tile: '#F5E6D0', ink: '#7A5222', slice: '#E9CC9F' },
  teal: { tile: '#D6F0EB', ink: '#1E6B62', slice: '#93D7CC' },
} as const;

export type FoodColor = keyof typeof FOOD_COLORS;

export const COLOR_KEYS = Object.keys(FOOD_COLORS) as FoodColor[];

/** The palette colour a newly added food should get, rotating through the palette. */
export function nextColor(existingCount: number): FoodColor {
  return COLOR_KEYS[existingCount % COLOR_KEYS.length];
}

export const ICONS = ['rice', 'bowl', 'pizza', 'sushi', 'burger', 'cup'] as const;

export type FoodIconName = (typeof ICONS)[number];

/** Darken a #RRGGBB colour by `amount` (0..1), for text on a food's tile colour. */
export function darken(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => Math.round(((n >> shift) & 255) * (1 - amount));
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, '0')).join('')}`;
}

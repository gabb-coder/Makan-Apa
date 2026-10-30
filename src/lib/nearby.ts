import type { Food } from './foods';
import type { FoodColor, FoodIconName } from './palette';

/**
 * Food spots around Sunway University (Bandar Sunway, Selangor), from published guides
 * (Sunway's own eateries guide, Chiefeater, Time Out, Burpple, Seth Lui; October 2026).
 * Places change, so the app links to a Google Maps search for live hours and directions.
 */
export const NEARBY_LABEL = 'Sunway Uni';

export interface Spot {
  id: string;
  name: string;
  area: string;
  knownFor: string;
  /** 1 = under ~RM15, 2 = ~RM15–50, 3 = more. */
  price: 1 | 2 | 3;
  tags: string[];
  /** Words that tie the spot to a food on the list, e.g. "nasi lemak". */
  matches: string[];
  icon: FoodIconName;
  color: FoodColor;
  /** Only stated where a source does: on-campus halal, or a pork dish. */
  diet?: 'halal' | 'pork';
}

export const SUNWAY_SPOTS: Spot[] = [
  {
    id: 'campus-cafeterias',
    name: 'The Galley & Fresco',
    area: 'On campus',
    knownFor: 'Sunway College and University cafeterias, with daily promos and vegetarian options',
    price: 1,
    tags: ['cheap', 'rice'],
    matches: ['mixed rice', 'rice', 'campus'],
    icon: 'rice',
    color: 'sky',
    diet: 'halal',
  },
  {
    id: 'warung-pojok',
    name: 'Warung Pojok',
    area: 'Sunway Mentari',
    knownFor: 'Student favourite for Indonesian rice plates at very low prices',
    price: 1,
    tags: ['cheap', 'rice'],
    matches: ['mixed rice', 'nasi', 'rice', 'indonesian'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'lai-kong',
    name: 'Lai Kong',
    area: 'Dataran Mentari (PJS 8)',
    knownFor: 'Kopitiam with Melaka-style nasi lemak; listed as open 24 hours',
    price: 1,
    tags: ['rice', 'cheap', 'late night'],
    matches: ['nasi lemak', 'kopitiam', 'late night'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'restoran-jaring',
    name: 'Restoran Jaring',
    area: 'Sunway Mentari',
    knownFor: 'Nasi lemak with sambal petai',
    price: 1,
    tags: ['rice', 'malay'],
    matches: ['nasi lemak', 'malay'],
    icon: 'rice',
    color: 'mustard',
  },
  {
    id: 'garlic-chicken-rice',
    name: 'Garlic Roasted Chicken Rice',
    area: 'Bandar Sunway',
    knownFor: 'Popular garlic roasted chicken rice with fragrant rice and good chilli',
    price: 1,
    tags: ['rice', 'cheap'],
    matches: ['chicken rice'],
    icon: 'rice',
    color: 'peach',
  },
  {
    id: 'teh-tarik-place',
    name: 'Teh Tarik Place',
    area: 'Sunway Pyramid',
    knownFor: 'Mamak favourites: roti canai, nasi lemak ayam and teh tarik',
    price: 1,
    tags: ['cheap'],
    matches: ['mamak', 'roti', 'teh tarik', 'nasi lemak'],
    icon: 'cup',
    color: 'teal',
  },
  {
    id: 'powertea-lok-lok',
    name: 'POWERTEA Lok Lok',
    area: 'Bandar Sunway',
    knownFor: 'Lok lok sticks from RM1.50, open till 1am',
    price: 1,
    tags: ['cheap', 'late night'],
    matches: ['lok lok', 'late night', 'supper'],
    icon: 'bowl',
    color: 'tomato',
  },
  {
    id: 'ayam-gepuk-artisan',
    name: 'Ayam Gepuk Artisan',
    area: 'Bandar Sunway',
    knownFor: 'Smashed fried chicken with sambal, under RM20',
    price: 1,
    tags: ['cheap', 'rice'],
    matches: ['ayam gepuk', 'chicken', 'indonesian'],
    icon: 'rice',
    color: 'tomato',
  },
  {
    id: 'madam-tiow',
    name: 'Madam Tiow',
    area: 'Sunway Mentari Business Park',
    knownFor: 'Café-style set meals from RM9.90',
    price: 1,
    tags: ['cheap'],
    matches: ['set', 'cafe'],
    icon: 'bowl',
    color: 'plum',
  },
  {
    id: 'food-by-fat-cat',
    name: 'Food by Fat Cat',
    area: 'Sunway Geo Avenue',
    knownFor: 'Malaysian and Japanese-inspired rice bowls inside Jaya Grocer, 10am to 10pm',
    price: 2,
    tags: ['rice', 'japanese'],
    matches: ['rice bowl', 'japanese', 'don'],
    icon: 'rice',
    color: 'sand',
  },
  {
    id: 'roast-meat-shop',
    name: 'The Roast Meat Shop',
    area: 'Sunway Geo Avenue',
    knownFor: 'Hakka mee with roast pork',
    price: 2,
    tags: ['noodles'],
    matches: ['noodles', 'mee', 'roast'],
    icon: 'bowl',
    color: 'mustard',
    diet: 'pork',
  },
  {
    id: 'lim-ko-pi',
    name: 'Lim Ko Pi',
    area: 'Sunway Geo Avenue',
    knownFor: 'Kopitiam classics, including roast pork fried rice',
    price: 2,
    tags: ['rice'],
    matches: ['fried rice', 'kopitiam'],
    icon: 'cup',
    color: 'sand',
    diet: 'pork',
  },
  {
    id: 'chon-dak',
    name: 'Chon Dak',
    area: 'Sunway Geo Avenue',
    knownFor: 'Korean fried chicken, good for sharing',
    price: 2,
    tags: ['sharing', 'korean'],
    matches: ['korean', 'fried chicken', 'chicken'],
    icon: 'burger',
    color: 'peach',
  },
  {
    id: 'verythai-mookata',
    name: 'VeryThai Mookata',
    area: 'Sunway Geo Avenue',
    knownFor: 'Thai mookata and street food',
    price: 2,
    tags: ['sharing', 'thai'],
    matches: ['thai', 'mookata', 'bbq'],
    icon: 'bowl',
    color: 'teal',
  },
  {
    id: 'village-roast-duck',
    name: 'Village Roast Duck',
    area: 'Sunway Pyramid',
    knownFor: 'Roast duck, wantan mee, pork chop and fried rice',
    price: 2,
    tags: ['noodles', 'rice'],
    matches: ['roast duck', 'wantan', 'noodles', 'mee', 'fried rice'],
    icon: 'bowl',
    color: 'mustard',
    diet: 'pork',
  },
  {
    id: 'esquire-kitchen',
    name: 'Esquire Kitchen',
    area: 'Sunway Pyramid',
    knownFor: 'Cantonese home-style dishes to share',
    price: 2,
    tags: ['sharing', 'rice'],
    matches: ['chinese', 'cantonese', 'dishes'],
    icon: 'rice',
    color: 'tomato',
  },
  {
    id: 'seminyak',
    name: 'Seminyak by Warung Eropa',
    area: 'Sunway Pyramid',
    knownFor: 'Indonesian mixed platters',
    price: 2,
    tags: ['sharing', 'rice'],
    matches: ['indonesian', 'nasi', 'platter'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'dozo',
    name: 'Dozo',
    area: 'Sunway Square',
    knownFor: 'Japanese restaurant, often with buy-1-free-1 delivery deals',
    price: 2,
    tags: ['japanese'],
    matches: ['sushi', 'japanese', 'ramen', 'sashimi'],
    icon: 'sushi',
    color: 'plum',
  },
  {
    id: 'jp-and-co',
    name: 'JP&Co',
    area: 'Sunway Square',
    knownFor: 'Café with a big breakfast and Western plates',
    price: 2,
    tags: ['western'],
    matches: ['western', 'breakfast', 'brunch', 'pasta', 'burger', 'pizza'],
    icon: 'burger',
    color: 'sky',
  },
  {
    id: 'shiang-hai-vegetarian',
    name: 'Shiang Hai Vegetarian',
    area: 'Bandar Sunway',
    knownFor: 'Vegetarian sushi and noodles',
    price: 2,
    tags: ['vegetarian', 'noodles'],
    matches: ['vegetarian', 'veggie', 'noodles'],
    icon: 'sushi',
    color: 'leaf',
  },
];

export function spotMapsUrl(spot: Spot): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${spot.area} Bandar Sunway`)}`;
}

export function priceLabel(price: Spot['price']): string {
  return price === 1 ? 'Under RM15' : price === 2 ? 'RM15–50' : 'RM50+';
}

/** Spots that fit a food: the longest dish-name match counts most, then shared tags. */
export function spotsFor(food: Pick<Food, 'name' | 'tags'>, limit = 3): Spot[] {
  const name = food.name.toLowerCase();
  return SUNWAY_SPOTS.map((spot) => {
    const nameHit = Math.max(0, ...spot.matches.filter((m) => name.includes(m) || m.includes(name)).map((m) => m.length));
    const tagHits = spot.tags.filter((t) => food.tags.includes(t)).length;
    const exact = spot.name.toLowerCase() === name ? 10_000 : 0; // picked straight from Near Sunway
    return { spot, score: exact + nameHit * 10 + tagHits };
  })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.spot);
}

/** A different order each day, so the Today ideas don't always start with the same places. */
export function spotsOfTheDay(date: string): Spot[] {
  let seed = [...date].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const list = [...SUNWAY_SPOTS];
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

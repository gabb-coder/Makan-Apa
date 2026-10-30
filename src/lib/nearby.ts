import type { Food } from './foods';
import { distanceKm, type LatLng } from './geo';
import type { FoodColor, FoodIconName } from './palette';

/**
 * Food spots around Sunway University (Bandar Sunway, Selangor) and nearby SS15 Subang Jaya,
 * from published guides (Sunway's own eateries guide, Sunway Pyramid's halal list, Chiefeater,
 * Time Out, Burpple, Seth Lui, CelcomDigi, Grab; October 2026).
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
    area: 'Sunway Mentari (PJS 8)',
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
    area: 'Sunway Mentari (PJS 8)',
    knownFor: 'Dataran Mentari kopitiam with Melaka-style nasi lemak; listed as open 24 hours',
    price: 1,
    tags: ['rice', 'cheap', 'late night'],
    matches: ['nasi lemak', 'kopitiam', 'late night'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'restoran-jaring',
    name: 'Restoran Jaring',
    area: 'Sunway Mentari (PJS 8)',
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
    area: 'Sunway Mentari (PJS 8)',
    knownFor: 'Café-style set meals from RM9.90 in Sunway Mentari Business Park',
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
  {
    id: 'supamala-hotpot',
    name: 'SUPAMALA Hotpot',
    area: 'Sunway Pyramid',
    knownFor: 'Szechuan hotpot with lamb, bamboo shrimp paste and a curry soup option',
    price: 2,
    tags: ['sharing', 'chinese', 'spicy'],
    matches: ['hotpot', 'steamboat', 'szechuan', 'mala'],
    icon: 'bowl',
    color: 'tomato',
    diet: 'halal',
  },
  {
    id: 'kyochon',
    name: 'KyoChon',
    area: 'Sunway Pyramid',
    knownFor: 'Korean fried chicken, best known for the Honey Garlic series',
    price: 2,
    tags: ['korean', 'sharing'],
    matches: ['korean', 'fried chicken', 'chicken'],
    icon: 'burger',
    color: 'mustard',
  },
  {
    id: 'tea-garden',
    name: 'Tea Garden',
    area: 'Sunway Pyramid',
    knownFor: 'Homemade Malaysian recipes: nasi lemak, rendang and curry laksa',
    price: 2,
    tags: ['malay', 'rice'],
    matches: ['nasi lemak', 'laksa', 'rendang', 'curry'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'bananabro',
    name: 'BananaBro',
    area: 'Sunway Pyramid',
    knownFor: 'Banana leaf rice inspired by South Indian street food',
    price: 2,
    tags: ['rice', 'indian'],
    matches: ['banana leaf', 'indian', 'curry', 'mixed rice'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'ayam-penyet-express',
    name: 'Ayam Penyet Express',
    area: 'Sunway Pyramid',
    knownFor: 'Ayam penyet with fiery sambal (LG2.86)',
    price: 1,
    tags: ['cheap', 'rice', 'spicy'],
    matches: ['ayam penyet', 'ayam gepuk', 'chicken', 'indonesian'],
    icon: 'rice',
    color: 'tomato',
    diet: 'halal',
  },
  {
    id: 'bungkus-kaw-kaw',
    name: 'Bungkus Kaw Kaw',
    area: 'Sunway Pyramid',
    knownFor: 'Teh tarik, kopi and cham in old-school bungkus style, plus local snacks (LG2.75A)',
    price: 1,
    tags: ['cheap', 'drinks'],
    matches: ['teh tarik', 'kopi', 'drinks', 'snack'],
    icon: 'cup',
    color: 'sand',
  },
  {
    id: 'nak-nak',
    name: 'Nak Nak',
    area: 'Sunway Pyramid',
    knownFor: 'Quick Korean-inspired comfort food',
    price: 2,
    tags: ['korean'],
    matches: ['korean', 'rice bowl'],
    icon: 'bowl',
    color: 'plum',
    diet: 'halal',
  },
  {
    id: 'cili-kampung',
    name: 'Cili Kampung',
    area: 'Sunway Pyramid',
    knownFor: 'Lively Malay kampung-style dishes',
    price: 2,
    tags: ['malay', 'rice', 'sharing'],
    matches: ['malay', 'kampung', 'nasi', 'mixed rice'],
    icon: 'rice',
    color: 'mustard',
    diet: 'halal',
  },
  {
    id: 'nasi-kandar-pelita',
    name: 'Nasi Kandar Pelita',
    area: 'Sunway Metro (PJS 11)',
    knownFor: 'Nasi kandar, plus kebab, shawarma and mandi rice',
    price: 1,
    tags: ['rice', 'cheap'],
    matches: ['nasi kandar', 'mamak', 'mandi', 'kebab', 'shawarma'],
    icon: 'rice',
    color: 'sand',
  },
  {
    id: 'burger-baek',
    name: 'Burger Baek',
    area: 'Sunway Mentari (PJS 8)',
    knownFor: 'Supper burgers plus kam heong lala and fried rice, open 2pm to 3am',
    price: 1,
    tags: ['cheap', 'late night', 'western'],
    matches: ['burger', 'supper', 'late night', 'lala'],
    icon: 'burger',
    color: 'peach',
  },
  {
    id: 'gold-chilli',
    name: 'Gold Chilli',
    area: 'SS15 Subang Jaya',
    knownFor: 'Salted egg buttermilk chicken rice, 11am to 10:30pm',
    price: 1,
    tags: ['rice', 'cheap'],
    matches: ['buttermilk', 'salted egg', 'chicken rice', 'chicken'],
    icon: 'rice',
    color: 'mustard',
  },
  {
    id: 'super-kitchen-pan-mee',
    name: 'Super Kitchen Chilli Pan Mee',
    area: 'SS15 Subang Jaya',
    knownFor: 'Dry chilli pan mee with minced pork, 8:30am to 9:30pm',
    price: 1,
    tags: ['noodles', 'cheap'],
    matches: ['pan mee', 'chilli pan mee', 'noodles', 'mee'],
    icon: 'bowl',
    color: 'tomato',
    diet: 'pork',
  },
  {
    id: 'lim-fried-chicken',
    name: 'Lim Fried Chicken (LFC)',
    area: 'SS15 Subang Jaya',
    knownFor: 'Crispy fried chicken thighs with rice or chee cheong fun',
    price: 1,
    tags: ['rice', 'cheap'],
    matches: ['fried chicken', 'chicken', 'nasi campur'],
    icon: 'rice',
    color: 'peach',
  },
  {
    id: 'rata',
    name: 'RATA',
    area: 'SS15 Subang Jaya',
    knownFor: 'Elevated Malaysian fusion, like mutton masala pizza; book ahead on weekends',
    price: 2,
    tags: ['malay', 'western', 'sharing'],
    matches: ['pizza', 'fusion', 'malaysian'],
    icon: 'pizza',
    color: 'tomato',
  },
  {
    id: 'q-bistro',
    name: 'Q Bistro',
    area: 'SS15 Subang Jaya',
    knownFor: 'Mamak: roti canai, nasi kandar and maggi goreng, open till 1am (2am weekends)',
    price: 1,
    tags: ['cheap', 'late night'],
    matches: ['mamak', 'roti', 'nasi kandar', 'maggi', 'supper'],
    icon: 'cup',
    color: 'teal',
  },
  {
    id: 'uncle-soon-fried-rice',
    name: 'Uncle Soon Fried Rice',
    area: 'SS15 Subang Jaya',
    knownFor: 'Fried rice with add-ons like fried egg, char siew or sambal',
    price: 1,
    tags: ['rice', 'cheap'],
    matches: ['fried rice'],
    icon: 'rice',
    color: 'sand',
    diet: 'pork',
  },
  {
    id: 'xiao-yu',
    name: 'Xiao Yu',
    area: 'SS15 Subang Jaya',
    knownFor: 'Sichuan suan cai yu: fish in pickled mustard green broth',
    price: 2,
    tags: ['chinese', 'spicy', 'sharing'],
    matches: ['fish', 'sichuan', 'suan cai'],
    icon: 'bowl',
    color: 'mustard',
  },
  {
    id: 'mad-bebek',
    name: 'Mad Bebek',
    area: 'SS15 Subang Jaya',
    knownFor: 'Ayam gepuk and bebek goreng with nasi lemak',
    price: 1,
    tags: ['rice', 'cheap', 'spicy'],
    matches: ['ayam gepuk', 'bebek', 'nasi lemak', 'indonesian'],
    icon: 'rice',
    color: 'tomato',
  },
  {
    id: 'warong-samad',
    name: 'Warong Samad',
    area: 'SS15 Subang Jaya',
    knownFor: 'Everyday Malaysian food, casual and no-fuss',
    price: 1,
    tags: ['malay', 'rice', 'cheap'],
    matches: ['malay', 'nasi', 'mixed rice'],
    icon: 'rice',
    color: 'leaf',
  },
  {
    id: 'naj-and-belle',
    name: 'Naj & Belle',
    area: 'SS15 Subang Jaya',
    knownFor: 'Brunch, pasta, coffee and their watermelon cake',
    price: 2,
    tags: ['western', 'brunch', 'dessert'],
    matches: ['brunch', 'cake', 'pasta', 'cafe', 'western'],
    icon: 'cup',
    color: 'plum',
  },
  {
    id: 'fatbaby-ice-cream',
    name: 'Fatbaby Ice Cream',
    area: 'SS15 Subang Jaya',
    knownFor: 'Ice cream and waffles, Wednesday to Sunday 1pm to 10pm',
    price: 1,
    tags: ['dessert'],
    matches: ['ice cream', 'dessert', 'waffle'],
    icon: 'cup',
    color: 'sky',
  },
];

/**
 * Rough middle of each area (from map pins), so spots can be sorted by how far away they are.
 * Spots are placed at their area, so distances are approximate to a few hundred metres.
 */
export const AREA_CENTRES: Record<string, LatLng> = {
  'On campus': { lat: 3.0672, lng: 101.6036 },
  'Bandar Sunway': { lat: 3.0672, lng: 101.6036 },
  'Sunway Pyramid': { lat: 3.0725, lng: 101.6072 },
  'Sunway Square': { lat: 3.0664, lng: 101.6082 },
  'Sunway Geo Avenue': { lat: 3.0652, lng: 101.6096 },
  'Sunway Mentari (PJS 8)': { lat: 3.0799, lng: 101.6138 },
  'Sunway Metro (PJS 11)': { lat: 3.0768, lng: 101.6109 },
  'SS15 Subang Jaya': { lat: 3.0768, lng: 101.5875 },
};

export const SUNWAY_CENTRE = AREA_CENTRES['On campus'];

/** Beyond this, the Sunway picks aren't "near you" and the app searches around you instead. */
export const NEAR_SUNWAY_KM = 8;

export function spotDistanceKm(spot: Spot, here: LatLng): number {
  return distanceKm(here, AREA_CENTRES[spot.area] ?? SUNWAY_CENTRE);
}

export function isNearSunway(here: LatLng): boolean {
  return distanceKm(here, SUNWAY_CENTRE) <= NEAR_SUNWAY_KM;
}

/** Nearest first; ties keep their order (so the day's shuffle still varies equal areas). */
export function byDistance(spots: Spot[], here: LatLng): Spot[] {
  return spots
    .map((spot, i) => ({ spot, i, km: spotDistanceKm(spot, here) }))
    .sort((a, b) => a.km - b.km || a.i - b.i)
    .map((x) => x.spot);
}

/** Quick Google Maps searches around you, for anywhere the Sunway list doesn't cover. */
export const NEAR_YOU_SEARCHES: { label: string; query: string; icon: FoodIconName; color: FoodColor }[] = [
  { label: 'Anything good', query: 'restaurants', icon: 'bowl', color: 'tomato' },
  { label: 'Mamak', query: 'mamak', icon: 'cup', color: 'mustard' },
  { label: 'Nasi lemak', query: 'nasi lemak', icon: 'rice', color: 'leaf' },
  { label: 'Chicken rice', query: 'chicken rice', icon: 'rice', color: 'mustard' },
  { label: 'Noodles', query: 'noodles', icon: 'bowl', color: 'sand' },
  { label: 'Korean', query: 'korean food', icon: 'bowl', color: 'plum' },
  { label: 'Cafe', query: 'cafe', icon: 'cup', color: 'teal' },
  { label: 'Dessert', query: 'dessert', icon: 'cup', color: 'peach' },
];

export function spotMapsUrl(spot: Spot): string {
  const where = spot.area === 'On campus' ? 'Sunway University' : /sunway|subang/i.test(spot.area) ? spot.area : `${spot.area} Bandar Sunway`;
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${spot.name} ${where}`)}`;
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

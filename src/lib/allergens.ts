import { tk } from './i18n';

/** Things people avoid, flagged on menu items by what the dish's name says it has. */
export const ALLERGENS = [
  { key: 'nuts', emoji: '🥜', label: tk('Nuts') },
  { key: 'seafood', emoji: '🦐', label: tk('Seafood') },
  { key: 'spicy', emoji: '🌶️', label: tk('Spicy') },
  { key: 'dairy', emoji: '🥛', label: tk('Dairy') },
  { key: 'egg', emoji: '🥚', label: tk('Egg') },
  { key: 'gluten', emoji: '🌾', label: tk('Gluten') },
] as const;
export type Allergen = (typeof ALLERGENS)[number]['key'];

// Words in Malaysian menus (English, Malay, Chinese romanisation) that give a dish away.
const WORDS: Record<Allergen, RegExp> = {
  nuts: /\b(peanuts?|nuts?|satay|kacang|almonds?|cashews?|walnuts?|pecans?|praline|rojak|gado|kung pao|pesto|nutella)\b/i,
  seafood: /\b(prawns?|shrimps?|udang|sotong|squid|calamari|fish|ikan|salmon|tuna|cod|crabs?|ketam|lala|clams?|mussels?|oysters?|scallops?|lobster|anchov(y|ies)|bilis|belacan|cincalok|otak|seafood|unagi|ebi|sashimi|sushi|tom yum|laksa|fishball|fish ball|har gow|cockles?|kerang)\b/i,
  spicy: /\b(spicy|chill?i|chilli|sambal|mala|pedas|curry|kari|rendang|tom yum|laksa|buldak|tteokbokki|kimchi|szechuan|sichuan|jalape(n|ñ)o|peri.?peri|cili|masak merah|asam pedas|nasi lemak|mee goreng mamak|vindaloo)\b/i,
  dairy: /\b(cheese|cheesy|milk|susu|cream|creamy|butter|buttermilk|mozzarella|cheddar|parmesan|latte|milo|yogh?urt|ice cream|carbonara|alfredo|paneer|ghee|teh tarik|kopi c|cendol|bubble tea|boba)\b/i,
  egg: /\b(eggs?|telur|omelet(te)?|tamago|mayo|mayonnaise|carbonara|kaya|egg tart|fu yong|foo young|roti telur|half.?boiled)\b/i,
  gluten: /\b(bread|roti|bun|burger|sandwich|toast|pasta|spaghetti|noodles?|mee|mi|ramen|udon|wantan|wonton|dumplings?|gyoza|pizza|cake|waffle|pancake|tempura|katsu|batter|fried chicken|wheat|soy sauce|pau|bao|naan|chapati|murtabak|tteokbokki)\b/i,
};

/** What a dish's name suggests it has. */
export function allergensIn(name: string): Allergen[] {
  return ALLERGENS.map((a) => a.key).filter((k) => WORDS[k].test(name));
}

export function allergenInfo(key: string) {
  return ALLERGENS.find((a) => a.key === key);
}

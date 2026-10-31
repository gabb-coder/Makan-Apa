import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

if (!url || !key) {
  throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY. See .env.');
}

export const supabase = createClient(url, key);

export interface RoomRow {
  id: string;
  code: string;
  /** Optional, set by the host, e.g. "Sunway lunch gang". */
  name: string | null;
  timezone: string;
  rotation_start: string;
  veto_limit: number;
  decision_mode: 'decider' | 'secret';
  /** Decide lunch only, or lunch and dinner. */
  meals: 'lunch' | 'both';
  created_at: string;
}

export interface FoodOptionRow {
  id: string;
  room_id: string;
  name: string;
  tags: string[];
  icon: string;
  color: string;
  added_by: string | null;
  is_active: boolean;
  diet: string[];
  price: number | null;
  created_at: string;
}

export interface MemberRow {
  id: string;
  room_id: string;
  name: string;
  color: string;
  sort_order: number;
  /** halal, no-pork, no-beef, vegetarian */
  diet: string[];
  /** Most they want to spend: 1 under RM15, 2 under RM50; null for any. */
  budget: number | null;
  created_at: string;
}

export type DayStatus = 'pending' | 'proposed' | 'accepted';
export type Meal = 'lunch' | 'dinner';

export interface DayEntryRow {
  id: string;
  room_id: string;
  entry_date: string;
  decider_id: string | null;
  food_option_id: string | null;
  custom_food: string | null;
  method: 'direct' | 'wheel' | null;
  status: DayStatus;
  meal: Meal;
  created_at: string;
}

export interface VetoRow {
  id: string;
  day_entry_id: string;
  member_id: string;
  rejected_food: string;
  created_at: string;
}

export interface SecretPickRow {
  id: string;
  day_entry_id: string;
  member_id: string;
  food_text: string;
  created_at: string;
}

export interface MealRatingRow {
  day_entry_id: string;
  member_id: string;
  rating: -1 | 1;
  created_at: string;
}

export interface MealBillRow {
  day_entry_id: string;
  room_id: string;
  paid_by: string;
  amount_cents: number;
  split_between: string[];
  updated_at: string;
}

export interface SettlementRow {
  id: string;
  room_id: string;
  from_member: string;
  to_member: string;
  amount_cents: number;
  created_at: string;
}

export interface RoomSpotRow {
  id: string;
  room_id: string;
  name: string;
  area: string | null;
  note: string | null;
  price: number | null;
  diet: 'halal' | 'pork' | null;
  lat: number | null;
  lng: number | null;
  added_by: string | null;
  created_at: string;
}

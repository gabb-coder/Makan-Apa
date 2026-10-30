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
  timezone: string;
  rotation_start: string;
  veto_limit: number;
  decision_mode: 'decider' | 'secret';
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
  created_at: string;
}

export interface MemberRow {
  id: string;
  room_id: string;
  name: string;
  color: string;
  sort_order: number;
  created_at: string;
}

export type DayStatus = 'pending' | 'proposed' | 'accepted';

export interface DayEntryRow {
  id: string;
  room_id: string;
  entry_date: string;
  decider_id: string;
  food_option_id: string | null;
  custom_food: string | null;
  method: 'direct' | 'wheel' | null;
  status: DayStatus;
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

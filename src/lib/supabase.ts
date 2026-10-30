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

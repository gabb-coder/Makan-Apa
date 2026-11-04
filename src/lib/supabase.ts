import type { BillItem } from './money';
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
  /** The room's icon on the main menu, and its colour. */
  emoji?: string | null;
  color?: string | null;
  /** Weekday (0 Sunday … 6 Saturday) → a food that's always eaten that day, e.g. {"5": "Mamak"}. */
  fixed_days?: Record<string, string>;
  /** Who the host handed over to; without one the longest-standing member is host. */
  host_id?: string | null;
  /** New people ask to join and the host lets them in. */
  locked?: boolean;
  /** Holds the group kitty's cash; the kitty is on while someone does. */
  kitty_keeper?: string | null;
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
  /** How to pay them back: a DuitNow phone or ID, and/or a bank account. Only they can set it. */
  pay_duitnow?: string | null;
  pay_bank?: string | null;
  /** Set when they left the room: kept for its history and money, out of turns and new bills. */
  left_at?: string | null;
  /** A photo of their DuitNow QR, in the room's receipts folder. */
  pay_qr_path?: string | null;
  /** Set when the host removed them: they need the host's OK to come back. */
  removed_at?: string | null;
  /** Things they avoid, flagged on menus: nuts, seafood, spicy, dairy, gluten, egg. */
  allergies?: string[];
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
  /** Meet-up once decided: when to leave and where to meet. */
  meet_at?: string | null;
  meet_place?: string | null;
  /** A quick vote: the options, and when voting closes. */
  vote_options?: string[] | null;
  vote_ends_at?: string | null;
  updated_at?: string;
  created_at: string;
}

export interface VoteRow {
  day_entry_id: string;
  member_id: string;
  /** Index into the day's vote_options. */
  choice: number;
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
  /** Itemised bills: each item shared between its people. Null for an equal split. */
  items?: BillItem[] | null;
  service_pct?: number | string;
  sst_pct?: number | string;
  /** A photo in the private receipts bucket, under <room id>/. */
  receipt_path?: string | null;
  /** Paid out of the room's kitty (by its keeper): no debts, it comes off kitty balances. */
  from_kitty?: boolean;
  /** The payer's treat: nobody owes anything for it. */
  treat?: boolean;
  /** Whose birthday it is: their share is spread over everyone else. */
  birthday?: string | null;
  /** An event's bill (event_bills), with day_entry_id holding the event's id. */
  event?: boolean;
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

export type Attendance = 'in' | 'late' | 'out';

/** Someone's answer to "Who's in?" for a meal. No row means in. */
export interface AttendanceRow {
  room_id: string;
  entry_date: string;
  meal: Meal;
  member_id: string;
  status: Attendance;
  /** Friends they're bringing who aren't on the app (+1, +2). */
  guests?: number;
  updated_at: string;
}

/** Someone's going to buy the meal and take everyone's orders. One per meal. */
export interface TapauRunRow {
  id: string;
  room_id: string;
  day_entry_id: string;
  runner_id: string;
  place: string;
  status: 'open' | 'closed';
  created_at: string;
}

export interface TapauOrderRow {
  id: string;
  run_id: string;
  member_id: string;
  item: string;
  qty: number;
  price_cents: number | null;
  note: string | null;
  created_at: string;
}

/** A message in the room's chat. */
export interface MessageRow {
  id: string;
  room_id: string;
  member_id: string;
  body: string;
  /** A poll shown in the chat. */
  poll_id?: string | null;
  created_at: string;
}

export const REACTION_EMOJIS = ['🔥', '👍', '😋', '🤔', '😴'] as const;
export type ReactionEmoji = (typeof REACTION_EMOJIS)[number];

export interface ReactionRow {
  day_entry_id: string;
  member_id: string;
  emoji: ReactionEmoji;
  created_at: string;
}

/** A tip on a place: spot_id is the app's spot id (a Sunway spot, or a room spot's id). */
export interface PlaceNoteRow {
  id: string;
  room_id: string;
  spot_id: string;
  member_id: string;
  body: string;
  created_at: string;
}

/** A photo of a meal, in the receipts bucket under <room id>/meals/. */
export interface MealPhotoRow {
  id: string;
  room_id: string;
  day_entry_id: string;
  member_id: string;
  path: string;
  created_at: string;
}

export interface KittyTopUpRow {
  id: string;
  room_id: string;
  member_id: string;
  amount_cents: number;
  created_by: string | null;
  created_at: string;
}

/** Someone asking to join a locked room (or to come back after being removed). */
export interface JoinRequestRow {
  id: string;
  room_id: string;
  user_id: string;
  name: string;
  status: 'pending' | 'approved' | 'declined';
  created_at: string;
}

export interface PollRow {
  id: string;
  room_id: string;
  member_id: string;
  question: string;
  options: string[];
  created_at: string;
}

export interface PollVoteRow {
  poll_id: string;
  member_id: string;
  choice: number;
  created_at: string;
}

/** A one-off plan: a birthday dinner, a Friday outing. */
export interface EventRow {
  id: string;
  room_id: string;
  created_by: string | null;
  title: string;
  starts_at: string;
  place: string | null;
  note: string | null;
  created_at: string;
}

export type Rsvp = 'yes' | 'maybe' | 'no';

export interface EventRsvpRow {
  event_id: string;
  member_id: string;
  status: Rsvp;
  updated_at: string;
}

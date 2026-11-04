import { ensureSignedIn, knownRooms } from './session';
import { supabase, type MemberRow } from './supabase';
import type { MemberPatch } from './useRoomData';

/** What follows you into every room: food needs, budget and how to pay you back. */
export type ProfilePatch = Partial<Pick<MemberPatch, 'diet' | 'budget' | 'pay_duitnow' | 'pay_bank' | 'allergies'>>;

/** You in each room on this phone (one member per room), most recently opened first. */
export async function myMembers(): Promise<MemberRow[]> {
  const ids = knownRooms().map((r) => r.memberId);
  if (!ids.length) return [];
  await ensureSignedIn();
  const { data, error } = await supabase.from('members').select('*').in('id', ids);
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as MemberRow[];
  return ids.map((id) => rows.find((m) => m.id === id)).filter((m): m is MemberRow => !!m);
}

/** Save food needs, budget or payment details in every room you're in. */
export async function updateEverywhere(patch: ProfilePatch): Promise<void> {
  const ids = knownRooms().map((r) => r.memberId);
  const results = await Promise.all(ids.map((id) => supabase.from('members').update(patch).eq('id', id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
}

/**
 * A room just joined or created: bring your food needs, budget and payment details from your
 * other rooms, so you don't set them again.
 */
export async function carryProfile(newMemberId: string): Promise<void> {
  const others = (await myMembers()).filter((m) => m.id !== newMemberId);
  const from = others.find((m) => (m.diet?.length ?? 0) > 0 || (m.allergies?.length ?? 0) > 0 || m.budget !== null || m.pay_duitnow || m.pay_bank);
  if (!from) return;
  const patch: ProfilePatch = { diet: from.diet ?? [], allergies: from.allergies ?? [], budget: from.budget ?? null, pay_duitnow: from.pay_duitnow ?? null, pay_bank: from.pay_bank ?? null };
  await supabase.from('members').update(patch).eq('id', newMemberId);
}

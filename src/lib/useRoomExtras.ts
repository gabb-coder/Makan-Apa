import { t } from './i18n';
import { useCallback, useEffect, useState } from 'react';
import { supabase, type MealBillRow, type MealRatingRow, type RoomSpotRow, type SettlementRow } from './supabase';

type RoomSpotDraft = Pick<RoomSpotRow, 'name' | 'area' | 'note' | 'price' | 'diet' | 'lat' | 'lng'>;

const RECEIPTS = 'receipts';

/** Phone photos are several MB; a 1600px JPEG is plenty to read a receipt. */
async function shrinkPhoto(file: Blob, max = 1600): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8));
    if (blob) return blob;
  } catch {
    // Fall through: send the photo as it is if the browser can't decode it.
  }
  if (file.size > 3 * 1024 * 1024) throw new Error(t('That photo is too big. Try a smaller one.'));
  return file;
}

async function must<T>(q: PromiseLike<{ data: T; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data;
}

/**
 * The room's meal ratings, bills, paybacks and own spots, kept live. Small tables, so any change
 * just reloads the one that changed.
 */
export function useRoomExtras(roomId: string, meId: string) {
  const [ratings, setRatings] = useState<MealRatingRow[]>([]);
  const [bills, setBills] = useState<MealBillRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [spots, setSpots] = useState<RoomSpotRow[]>([]);

  const loadRatings = useCallback(async () => {
    const { data } = await supabase.from('meal_ratings').select('*, day_entries!inner(room_id)').eq('day_entries.room_id', roomId);
    if (data) setRatings((data as (MealRatingRow & { day_entries?: unknown })[]).map(({ day_entries: _, ...r }) => r));
  }, [roomId]);
  const loadBills = useCallback(async () => {
    const { data } = await supabase.from('meal_bills').select('*').eq('room_id', roomId);
    if (data) setBills(data as MealBillRow[]);
  }, [roomId]);
  const loadSettlements = useCallback(async () => {
    const { data } = await supabase.from('settlements').select('*').eq('room_id', roomId).order('created_at');
    if (data) setSettlements(data as SettlementRow[]);
  }, [roomId]);
  const loadSpots = useCallback(async () => {
    const { data } = await supabase.from('room_spots').select('*').eq('room_id', roomId).order('created_at');
    if (data) setSpots(data as RoomSpotRow[]);
  }, [roomId]);

  useEffect(() => {
    const all = () => Promise.all([loadRatings(), loadBills(), loadSettlements(), loadSpots()]);
    void all();
    const room = `room_id=eq.${roomId}`;
    const channel = supabase
      .channel(`extras:${roomId}`)
      // Ratings have no room_id to filter on; reloading is cheap.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_ratings' }, () => void loadRatings())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_bills', filter: room }, () => void loadBills())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_bills' }, () => void loadBills())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'settlements', filter: room }, () => void loadSettlements())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'settlements' }, () => void loadSettlements())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'room_spots', filter: room }, () => void loadSpots())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'room_spots' }, () => void loadSpots())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void all();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadRatings, loadBills, loadSettlements, loadSpots]);

  /** Thumbs up (1), down (-1), or take your rating back (null). */
  const rate = async (dayEntryId: string, rating: 1 | -1 | null) => {
    if (rating === null) await must(supabase.from('meal_ratings').delete().eq('day_entry_id', dayEntryId).eq('member_id', meId));
    else await must(supabase.from('meal_ratings').upsert({ day_entry_id: dayEntryId, member_id: meId, rating }));
    await loadRatings();
  };

  const saveBill = async (bill: Omit<MealBillRow, 'room_id' | 'updated_at'>) => {
    await must(supabase.from('meal_bills').upsert({ ...bill, room_id: roomId, updated_at: new Date().toISOString() }));
    await loadBills();
  };
  const removeBill = async (dayEntryId: string) => {
    const old = bills.find((b) => b.day_entry_id === dayEntryId)?.receipt_path;
    await must(supabase.from('meal_bills').delete().eq('day_entry_id', dayEntryId));
    if (old) void deleteReceipt(old);
    await loadBills();
  };

  /** Shrinks the photo and stores it under the room's folder; returns its path. */
  const uploadReceipt = async (file: Blob, dayEntryId: string): Promise<string> => {
    const photo = await shrinkPhoto(file);
    const path = `${roomId}/${dayEntryId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(RECEIPTS).upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    return path;
  };
  const deleteReceipt = async (path: string) => {
    await supabase.storage.from(RECEIPTS).remove([path]);
  };
  /** A link to the photo that works for an hour (the bucket is private). */
  const receiptUrl = async (path: string): Promise<string | null> => {
    const { data } = await supabase.storage.from(RECEIPTS).createSignedUrl(path, 3600);
    return data?.signedUrl ?? null;
  };
  /** Before the room is deleted: its receipt photos go too. */
  const clearReceipts = async () => {
    const { data } = await supabase.storage.from(RECEIPTS).list(roomId, { limit: 1000 });
    if (data?.length) await supabase.storage.from(RECEIPTS).remove(data.map((f) => `${roomId}/${f.name}`));
  };

  const recordPayment = async (p: Pick<SettlementRow, 'from_member' | 'to_member' | 'amount_cents'>) => {
    await must(supabase.from('settlements').insert({ ...p, room_id: roomId }));
    await loadSettlements();
  };
  const removePayment = async (id: string) => {
    await must(supabase.from('settlements').delete().eq('id', id));
    await loadSettlements();
  };

  const addSpot = async (spot: RoomSpotDraft) => {
    await must(supabase.from('room_spots').insert({ ...spot, room_id: roomId, added_by: meId }));
    await loadSpots();
  };
  const removeSpot = async (id: string) => {
    await must(supabase.from('room_spots').delete().eq('id', id));
    await loadSpots();
  };

  return { ratings, bills, settlements, spots, rate, saveBill, removeBill, uploadReceipt, deleteReceipt, receiptUrl, clearReceipts, recordPayment, removePayment, addSpot, removeSpot };
}

export type RoomExtras = ReturnType<typeof useRoomExtras>;

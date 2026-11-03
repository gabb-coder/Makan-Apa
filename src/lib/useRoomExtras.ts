import { shrinkPhoto } from './photo';
import { useCallback, useEffect, useState } from 'react';
import { supabase, type KittyTopUpRow, type MealBillRow, type MealPhotoRow, type MealRatingRow, type RoomSpotRow, type SettlementRow } from './supabase';

type RoomSpotDraft = Pick<RoomSpotRow, 'name' | 'area' | 'note' | 'price' | 'diet' | 'lat' | 'lng'>;

const RECEIPTS = 'receipts';

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
  const [photos, setPhotos] = useState<MealPhotoRow[]>([]);
  const [topUps, setTopUps] = useState<KittyTopUpRow[]>([]);

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

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase.from('meal_photos').select('*').eq('room_id', roomId).order('created_at', { ascending: false }).limit(500);
    if (data) setPhotos(data as MealPhotoRow[]);
  }, [roomId]);
  const loadTopUps = useCallback(async () => {
    const { data } = await supabase.from('kitty_topups').select('*').eq('room_id', roomId).order('created_at', { ascending: false });
    if (data) setTopUps(data as KittyTopUpRow[]);
  }, [roomId]);

  useEffect(() => {
    const all = () => Promise.all([loadRatings(), loadBills(), loadSettlements(), loadSpots(), loadPhotos(), loadTopUps()]);
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'meal_photos', filter: room }, () => void loadPhotos())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'meal_photos' }, () => void loadPhotos())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'kitty_topups', filter: room }, () => void loadTopUps())
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'kitty_topups' }, () => void loadTopUps())
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') void all();
      });
    return () => {
      supabase.removeChannel(channel);
    };
  }, [roomId, loadRatings, loadBills, loadSettlements, loadSpots, loadPhotos, loadTopUps]);

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
    for (const folder of [roomId, `${roomId}/meals`]) {
      const { data } = await supabase.storage.from(RECEIPTS).list(folder, { limit: 1000 });
      const files = (data ?? []).filter((f) => f.id);
      if (files.length) await supabase.storage.from(RECEIPTS).remove(files.map((f) => `${folder}/${f.name}`));
    }
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

  /** A photo of a meal: shrunk, stored under <room>/meals/, and listed for the room. */
  const addPhoto = async (dayEntryId: string, file: Blob) => {
    const photo = await shrinkPhoto(file);
    const path = `${roomId}/meals/${dayEntryId}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(RECEIPTS).upload(path, photo, { contentType: photo.type || 'image/jpeg', upsert: false });
    if (error) throw new Error(error.message);
    const { error: rowError } = await supabase.from('meal_photos').insert({ room_id: roomId, day_entry_id: dayEntryId, member_id: meId, path });
    if (rowError) {
      void supabase.storage.from(RECEIPTS).remove([path]);
      throw new Error(rowError.message);
    }
    await loadPhotos();
  };
  const removePhoto = async (photo: MealPhotoRow) => {
    const { data, error } = await supabase.from('meal_photos').delete().eq('id', photo.id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Only whoever added the photo, or the host, can remove it.');
    void supabase.storage.from(RECEIPTS).remove([photo.path]);
    await loadPhotos();
  };

  const addTopUp = async (memberId: string, cents: number) => {
    await must(supabase.from('kitty_topups').insert({ room_id: roomId, member_id: memberId, amount_cents: cents, created_by: meId }));
    await loadTopUps();
  };
  const removeTopUp = async (id: string) => {
    const { data, error } = await supabase.from('kitty_topups').delete().eq('id', id).select('id');
    if (error) throw new Error(error.message);
    if (!data?.length) throw new Error('Only whoever recorded it, the keeper or the host can undo a top-up.');
    await loadTopUps();
  };

  return { ratings, bills, settlements, spots, photos, topUps, addPhoto, removePhoto, addTopUp, removeTopUp, rate, saveBill, removeBill, uploadReceipt, deleteReceipt, receiptUrl, clearReceipts, recordPayment, removePayment, addSpot, removeSpot };
}

export type RoomExtras = ReturnType<typeof useRoomExtras>;

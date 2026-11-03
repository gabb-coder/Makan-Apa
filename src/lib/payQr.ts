import { shrinkPhoto } from './photo';
import { myMembers } from './profile';
import { supabase } from './supabase';

const BUCKET = 'receipts';

/**
 * Your DuitNow QR, saved in every room you're in (each room's own folder, so only that room can
 * see it). Replaces the one you had.
 */
export async function saveQrEverywhere(file: Blob): Promise<void> {
  const photo = await shrinkPhoto(file, 1000);
  for (const m of await myMembers()) {
    const path = `${m.room_id}/qr-${m.id}-${Date.now()}.jpg`;
    const { error } = await supabase.storage.from(BUCKET).upload(path, photo, { contentType: photo.type || 'image/jpeg' });
    if (error) throw new Error(error.message);
    const { error: err } = await supabase.from('members').update({ pay_qr_path: path }).eq('id', m.id);
    if (err) throw new Error(err.message);
    if (m.pay_qr_path) void supabase.storage.from(BUCKET).remove([m.pay_qr_path]);
  }
}

export async function removeQrEverywhere(): Promise<void> {
  for (const m of await myMembers()) {
    if (!m.pay_qr_path) continue;
    await supabase.from('members').update({ pay_qr_path: null }).eq('id', m.id);
    void supabase.storage.from(BUCKET).remove([m.pay_qr_path]);
  }
}

/** A link to someone's QR photo that works for an hour. */
export async function qrUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

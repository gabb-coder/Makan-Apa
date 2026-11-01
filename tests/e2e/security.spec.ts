import { expect, test } from '@playwright/test';
import { publicClient, signedInClient } from './helpers';

// Row-level security: the publishable key alone gets nothing, and signed-in phones only see
// rooms they're members of. Uses two anonymous sign-ins.
test('rooms are private to their members', async () => {
  const host = await signedInClient();
  const { data: created, error: createError } = await host.rpc('create_room', {
    p_name: 'Host',
    p_timezone: 'Asia/Kuala_Lumpur',
    p_rotation_start: '2026-10-30',
    p_room_name: 'Test room',
  });
  expect(createError).toBeNull();
  const room = created.room as { id: string; code: string };
  const hostMember = created.member as { id: string };

  try {
    // Nobody can list rooms or read a room's data with just the public key.
    const anyone = publicClient();
    const listed = await anyone.from('rooms').select('id');
    expect(listed.data ?? []).toHaveLength(0);
    const foods = await anyone.from('food_options').select('id').eq('room_id', room.id);
    expect(foods.data ?? []).toHaveLength(0);

    // A different phone that hasn't joined can't see or touch it either.
    const outsider = await signedInClient();
    expect((await outsider.from('rooms').select('id').eq('id', room.id)).data).toHaveLength(0);
    expect((await outsider.from('members').select('id').eq('room_id', room.id)).data).toHaveLength(0);
    const sneakIn = await outsider.from('members').insert({ room_id: room.id, name: 'Sneaky' });
    expect(sneakIn.error).not.toBeNull();
    const addFood = await outsider.from('food_options').insert({ room_id: room.id, name: 'Spam' });
    expect(addFood.error).not.toBeNull();
    expect((await outsider.rpc('join_room', { p_code: 'ZZZZZZ', p_name: 'Outsider' })).data).toBeNull();

    // Joining with the right code gives access...
    const joined = await outsider.rpc('join_room', { p_code: room.code, p_name: 'Guest' });
    expect(joined.error).toBeNull();
    expect((await outsider.from('rooms').select('id').eq('id', room.id)).data).toHaveLength(1);

    // ...but only the host can rename the room, remove people or delete the room.
    const rename = await outsider.from('rooms').update({ name: 'Hijacked' }).eq('id', room.id);
    expect(rename.error).not.toBeNull();
    const hostRename = await host.from('rooms').update({ name: 'Renamed' }).eq('id', room.id).select('name');
    expect(hostRename.data?.[0]?.name).toBe('Renamed');
    const kick = await outsider.from('members').delete().eq('id', hostMember.id).select('id');
    expect(kick.data ?? []).toHaveLength(0);
    const drop = await outsider.from('rooms').delete().eq('id', room.id).select('id');
    expect(drop.data ?? []).toHaveLength(0);
    const guestId = (joined.data as { member: { id: string } }).member.id;

    // Payment details: only you can set yours, so nobody can redirect your paybacks.
    const ownPay = await outsider.from('members').update({ pay_duitnow: '012-345 6789' }).eq('id', guestId).select('pay_duitnow');
    expect(ownPay.data?.[0]?.pay_duitnow).toBe('012-345 6789');
    const swapPay = await outsider.from('members').update({ pay_duitnow: '019-999 9999' }).eq('id', hostMember.id);
    expect(swapPay.error?.message).toContain('payment details');

    // Receipt photos: only the room's members can read or add them.
    const path = `${room.id}/test-${Date.now()}.png`;
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    expect((await host.storage.from('receipts').upload(path, png, { contentType: 'image/png' })).error).toBeNull();
    const stranger = await signedInClient();
    expect((await stranger.storage.from('receipts').download(path)).error).not.toBeNull();
    expect((await stranger.storage.from('receipts').upload(`${room.id}/sneaky.png`, png, { contentType: 'image/png' })).error).not.toBeNull();
    expect((await outsider.storage.from('receipts').download(path)).error).toBeNull();
    await host.storage.from('receipts').remove([path]);
    const hostKick = await host.from('members').delete().eq('id', guestId).select('id');
    expect(hostKick.data).toHaveLength(1);
  } finally {
    const cleanup = await host.from('rooms').delete().eq('id', room.id).select('id');
    expect(cleanup.data).toHaveLength(1);
  }
});

import { describe, expect, it } from 'vitest';
import { hostOf, normalizeCode, roomTitle } from './session';
import type { MemberRow } from './supabase';

describe('normalizeCode', () => {
  it('upper-cases, strips spaces and symbols, and keeps 6 characters', () => {
    expect(normalizeCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normalizeCode('abcdefgh')).toBe('ABCDEF');
  });
});

describe('roomTitle', () => {
  it('uses the room name, or falls back to the code', () => {
    expect(roomTitle({ name: 'Sunway lunch gang', code: 'K7M2QX' })).toBe('Sunway lunch gang');
    expect(roomTitle({ name: null, code: 'K7M2QX' })).toBe('Room K7M2QX');
    expect(roomTitle({ name: '   ', code: 'K7M2QX' })).toBe('Room K7M2QX');
  });
});

describe('hostOf', () => {
  const m = (id: string, created_at: string): MemberRow => ({ id, room_id: 'r', name: id, color: '#000', sort_order: 0, diet: [], budget: null, created_at });

  it('is the first member to join, whatever the rotation order', () => {
    expect(hostOf([m('alex', '2026-10-30T02:00:00Z'), m('gabriel', '2026-10-30T01:00:00Z')])?.id).toBe('gabriel');
  });

  it('is null for an empty room', () => {
    expect(hostOf([])).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { hostOf, normalizeCode } from './session';
import type { MemberRow } from './supabase';

describe('normalizeCode', () => {
  it('upper-cases, strips spaces and symbols, and keeps 6 characters', () => {
    expect(normalizeCode(' k7m-2qx ')).toBe('K7M2QX');
    expect(normalizeCode('abcdefgh')).toBe('ABCDEF');
  });
});

describe('hostOf', () => {
  const m = (id: string, created_at: string): MemberRow => ({ id, room_id: 'r', name: id, color: '#000', sort_order: 0, created_at });

  it('is the first member to join, whatever the rotation order', () => {
    expect(hostOf([m('alex', '2026-10-30T02:00:00Z'), m('gabriel', '2026-10-30T01:00:00Z')])?.id).toBe('gabriel');
  });

  it('is null for an empty room', () => {
    expect(hostOf([])).toBeNull();
  });
});

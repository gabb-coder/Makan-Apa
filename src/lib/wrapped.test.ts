import { describe, expect, it } from 'vitest';
import { vibeOf } from './wrapped';

describe('wrapped vibe', () => {
  it('calls a room explorers, creatures of habit, or a bit of both', () => {
    expect(vibeOf({ meals: 10, foods: 9 })).toBe('explorers');
    expect(vibeOf({ meals: 10, foods: 3 })).toBe('habit');
    expect(vibeOf({ meals: 10, foods: 5 })).toBe('balanced');
  });
  it('says nothing about a room that has barely eaten together', () => {
    expect(vibeOf({ meals: 2, foods: 2 })).toBeNull();
  });
});

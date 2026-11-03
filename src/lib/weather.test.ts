import { describe, expect, it } from 'vitest';
import { isWetCode, readRain } from './weather';

describe('weather', () => {
  it('knows rain codes', () => {
    expect([0, 3, 45].map(isWetCode)).toEqual([false, false, false]);
    expect([51, 63, 81, 95].map(isWetCode)).toEqual([true, true, true, true]);
  });
  it('reads rain now and rain soon', () => {
    expect(readRain({ current: { precipitation: 0.4, weather_code: 3 } })).toEqual({ now: true, soon: false });
    expect(readRain({ current: { precipitation: 0, weather_code: 61 } }).now).toBe(true);
    expect(readRain({ current: { precipitation: 0, weather_code: 2 }, hourly: { precipitation_probability: [20, 70] } })).toEqual({ now: false, soon: true });
    expect(readRain({ current: { precipitation: 0, weather_code: 1 }, hourly: { precipitation_probability: [10, 20] } })).toEqual({ now: false, soon: false });
  });
});

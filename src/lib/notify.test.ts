import { describe, expect, it } from 'vitest';
import { message } from '../../supabase/functions/_shared/messages';
import moneySource from './money.ts?raw';
import sharedMoney from '../../supabase/functions/_shared/money.ts?raw';

describe('notifications', () => {
  it('says what happened, in the phone’s language', () => {
    expect(message({ type: 'proposed', decider: 'Wei', food: 'Nasi Lemak', meal: 'lunch' })).toEqual({
      title: 'Wei picked Nasi Lemak for lunch',
      body: 'Tap to accept or veto.',
    });
    expect(message({ type: 'decided', food: 'Laksa', meal: 'dinner' }).title).toBe('Dinner is decided: Laksa');
    expect(message({ type: 'decided', food: 'Laksa', meal: 'lunch' }, 'ms').title).toBe('Makan tengah hari dah diputuskan: Laksa');
    expect(message({ type: 'bill', payer: 'Wei', amount: 'RM34.40', food: 'Nasi Lemak', share: 'RM15.16' }, 'zh')).toEqual({
      title: 'Wei为Nasi Lemak付了RM34.40',
      body: '你的份额是RM15.16。',
    });
    expect(message({ type: 'nudge', to: 'Wei', amount: 'RM15.16', several: false }).title).toBe('You owe Wei RM15.16');
    expect(message({ type: 'nudge', to: 'Wei', amount: 'RM30.00', several: true }).title).toBe('You owe RM30.00 in total');
    expect(message({ type: 'tapau', runner: 'Alex', place: 'Lai Kong' }, 'ms').title).toBe('Alex akan beli dari Lai Kong');
  });

  it('leaves no placeholder unfilled in any language', () => {
    const events = [
      { type: 'proposed', decider: 'A', food: 'B', meal: 'lunch' },
      { type: 'decided', food: 'B', meal: 'dinner' },
      { type: 'bill', payer: 'A', amount: 'RM1', food: 'B', share: 'RM1' },
      { type: 'tapau', runner: 'A', place: 'B' },
      { type: 'order', who: 'A', item: 'B' },
      { type: 'nudge', to: 'A', amount: 'RM1', several: false },
      { type: 'your-turn' },
      { type: 'secret-open' },
    ] as const;
    for (const lang of ['en', 'ms', 'zh'] as const) {
      for (const e of events) {
        const m = message(e, lang);
        expect(`${m.title} ${m.body}`, `${e.type} ${lang}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('keeps the Edge Functions’ money maths identical to the app’s', () => {
    expect(sharedMoney.endsWith(moneySource)).toBe(true);
  });
});

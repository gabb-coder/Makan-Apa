import { describe, expect, it } from 'vitest';
import { missing, t } from './i18n';

// Every t('...') in the app, read straight from the source files.
const all = import.meta.glob<string>('../**/*.{ts,tsx}', { query: '?raw', import: 'default', eager: true });
const sources = Object.fromEntries(Object.entries(all).filter(([file]) => !file.endsWith('.test.ts') && !file.includes('/i18n/') && !file.endsWith('/i18n.ts')));
// t('...') where it's shown, and tk('...') where a string is stored to be shown later.
const KEY = /\btk?\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;

function keys(): string[] {
  const found = new Set<string>();
  for (const text of Object.values(sources)) {
    for (const m of text.matchAll(KEY)) found.add(m[2].replace(/\\(['"\\])/g, '$1'));
  }
  return [...found];
}

describe('translations', () => {
  it('finds the strings the app uses', () => {
    expect(keys()).toContain('Food list');
  });

  it('has Bahasa Malaysia and Chinese for every string', () => {
    expect(missing(keys(), 'ms')).toEqual([]);
    expect(missing(keys(), 'zh')).toEqual([]);
  });

  it('fills in placeholders', () => {
    expect(t('Send to {name}', { name: 'Alex' })).toBe('Send to Alex');
    expect(t('{n} left', {})).toBe('{n} left');
  });

  it('never uses a template literal as a key', () => {
    for (const [file, text] of Object.entries(sources)) {
      expect(text.match(/\bt\(\s*`/g) ?? [], file).toEqual([]);
    }
  });
});

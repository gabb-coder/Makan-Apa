import { useSyncExternalStore } from 'react';
import { storage } from './storage';

/**
 * English, Bahasa Malaysia and Simplified Chinese. The English text is the key: t('Spin the
 * wheel') looks it up in the language's dictionary (src/i18n/*.ts) and falls back to English.
 * Placeholders use braces: t('Send to {name}', { name }).
 *
 * Malay and Chinese don't change nouns for plurals, so English singular/plural pairs are simply
 * two keys translated the same way.
 */
export type Lang = 'en' | 'ms' | 'zh';

export const LANGS: { key: Lang; label: string }[] = [
  { key: 'en', label: 'English' },
  { key: 'ms', label: 'Bahasa Malaysia' },
  { key: 'zh', label: '中文' },
];

type Dict = Record<string, string>;
export interface Translations {
  ms: Dict;
  zh: Dict;
}

// Every src/i18n/*.ts file exports `translations`; merged at build time.
const modules = import.meta.glob<{ translations: Translations }>('../i18n/*.ts', { eager: true });
const DICTS: Record<'ms' | 'zh', Dict> = { ms: {}, zh: {} };
for (const m of Object.values(modules)) {
  Object.assign(DICTS.ms, m.translations.ms);
  Object.assign(DICTS.zh, m.translations.zh);
}

const KEY = 'makan.lang';
const listeners = new Set<() => void>();

function fromBrowser(): Lang {
  const langs = typeof navigator === 'undefined' ? [] : navigator.languages ?? [navigator.language];
  for (const l of langs) {
    if (/^(ms|id)\b/i.test(l)) return 'ms';
    if (/^zh\b/i.test(l)) return 'zh';
    if (/^en\b/i.test(l)) return 'en';
  }
  return 'en';
}

let current: Lang = (() => {
  const saved = storage.get(KEY);
  return saved === 'en' || saved === 'ms' || saved === 'zh' ? saved : fromBrowser();
})();

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang) {
  current = lang;
  storage.set(KEY, lang);
  document.documentElement.lang = htmlLang(lang);
  listeners.forEach((l) => l());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    getLang,
    getLang,
  );
}

function htmlLang(lang: Lang): string {
  return lang === 'zh' ? 'zh-Hans' : lang;
}

/** For Intl date and number formatting. */
export function locale(lang = current): string {
  return lang === 'ms' ? 'ms-MY' : lang === 'zh' ? 'zh-CN' : 'en-GB';
}

/**
 * Marks a string that's stored now and shown later with t(), e.g. a label in a list of tabs,
 * so the dictionary test can find it. Returns it unchanged.
 */
export function tk<S extends string>(en: S): S {
  return en;
}

export function t(en: string, vars?: Record<string, string | number>): string {
  const text = current === 'en' ? en : (DICTS[current][en] ?? en);
  return vars ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m)) : text;
}

/** Keys with no translation yet, for the test that keeps dictionaries complete. */
export function missing(keys: string[], lang: 'ms' | 'zh'): string[] {
  return keys.filter((k) => !(k in DICTS[lang]));
}

if (typeof document !== 'undefined') document.documentElement.lang = htmlLang(current);

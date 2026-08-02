'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { en, type Dict } from './en';
import { hi } from './hi';

export type Lang = 'en' | 'hi';

const DICTS: Record<Lang, Dict> = { en, hi };
const STORAGE_KEY = 'sw360_lang';

interface I18nValue {
  lang: Lang;
  t: Dict;
  setLang: (lang: Lang) => void;
  toggle: () => void;
  /** Picks the Hindi variant of server-provided content when available. */
  pick: (enText: string, hiText?: string | null) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: React.ReactNode }) {
  // Always start from 'en' so the server and first client render agree; the stored
  // preference is applied in an effect, avoiding a hydration mismatch.
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === 'hi' || stored === 'en') setLangState(stored);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      t: DICTS[lang],
      setLang,
      toggle: () => setLang(lang === 'en' ? 'hi' : 'en'),
      pick: (enText, hiText) => (lang === 'hi' && hiText ? hiText : enText),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

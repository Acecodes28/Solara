'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { STRINGS, format, type Lang, type StringKey } from './strings';

interface Ctx {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: StringKey, vars?: Record<string, string | number>) => string;
  refreshTick: number;
  refresh: () => void;
}

const LangContext = createContext<Ctx | null>(null);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');
  const [refreshTick, setTick] = useState(0);
  useEffect(() => {
    try {
      const saved = localStorage.getItem('solara.lang');
      if (saved === 'hi' || saved === 'en') setLangState(saved);
    } catch { /* storage unavailable */ }
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);
  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try { localStorage.setItem('solara.lang', l); } catch { /* ignore */ }
  }, []);
  const t = useCallback((k: StringKey, vars?: Record<string, string | number>) => format(STRINGS[lang][k] ?? STRINGS.en[k], vars), [lang]);
  const refresh = useCallback(() => setTick((x) => x + 1), []);
  return <LangContext.Provider value={{ lang, setLang, t, refreshTick, refresh }}>{children}</LangContext.Provider>;
}

export function useApp() {
  const c = useContext(LangContext);
  if (!c) throw new Error('useApp outside AppProvider');
  return c;
}

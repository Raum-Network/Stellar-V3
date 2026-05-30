"use client";

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { translations, languages, defaultLanguage, rtlLanguages, type LanguageCode } from "@/i18n/translations";

const STORAGE_KEY = "raum_language";

type I18nContextValue = {
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
  languages: typeof languages;
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

const normalizeLanguage = (value: string): LanguageCode => {
  const lower = value.toLowerCase();
  const codes = new Set(languages.map((l) => l.code));
  if (codes.has(lower as LanguageCode)) return lower as LanguageCode;
  const base = lower.split("-")[0];
  if (codes.has(base as LanguageCode)) return base as LanguageCode;
  return defaultLanguage;
};

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<LanguageCode>(() => {
    if (typeof window === "undefined") return defaultLanguage;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) return normalizeLanguage(stored);
    return normalizeLanguage(window.navigator.language || defaultLanguage);
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, language);
    const root = window.document.documentElement;
    root.lang = language;
    root.dir = rtlLanguages.has(language) ? "rtl" : "ltr";
  }, [language]);

  const t = useCallback(
    (key: string, vars?: Record<string, string | number>) => {
      let text =
        translations[language]?.[key] ??
        translations[defaultLanguage]?.[key] ??
        key;
      if (vars) {
        Object.entries(vars).forEach(([k, v]) => {
          text = text.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
        });
      }
      return text;
    },
    [language]
  );

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      t,
      languages,
    }),
    [language, t]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    throw new Error("useI18n must be used within I18nProvider");
  }
  return ctx;
}

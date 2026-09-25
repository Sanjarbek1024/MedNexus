import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

import type { Check, Language } from "../lib/api";
import en from "./en";
import { findingName, specialtyLabel, taxonomyLabel } from "./labels";
import ru from "./ru";
import uz from "./uz";

const DICTIONARIES = { en, uz, ru } as const;
const STORAGE_KEY = "mednexus.language";
const LOCALES: Record<Language, string> = { uz: "uz-Latn-UZ", en: "en-GB", ru: "ru-RU" };
// Browsers ship incomplete Uzbek calendar data (e.g. "2026 M09 25"), so Uzbek dates are built here.
const UZ_MONTHS = ["yanvar", "fevral", "mart", "aprel", "may", "iyun", "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr"];
const UZ_WEEKDAYS = ["Ya", "Du", "Se", "Ch", "Pa", "Ju", "Sh"];

function uzbekDate(value: Date, withTime: boolean): string {
  const time = `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`;
  const day = `${value.getDate()}-${UZ_MONTHS[value.getMonth()]} ${value.getFullYear()}`;
  return withTime ? `${day}, ${time}` : day;
}

type Params = Record<string, string | number>;

function lookup(source: unknown, key: string): unknown {
  return key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], source);
}

function interpolate(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match)) : text;
}

interface I18n {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: string, params?: Params) => string;
  list: <T>(key: string) => readonly T[];
  finding: (name: string) => string;
  taxonomy: (id: string) => string;
  specialty: (id: string) => string;
  study: (s: { modality: string; region: string; view: string }) => string;
  check: (check: Check) => string;
  date: (iso: string, withTime?: boolean) => string;
  weekday: (iso: string) => string;
  number: (value: number, digits?: number) => string;
  percent: (ratio: number) => string;
}

const I18nContext = createContext<I18n | null>(null);

function initialLanguage(): Language {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "uz" || stored === "en" || stored === "ru") return stored;
  } catch {
    // storage unavailable
  }
  return "uz";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    document.documentElement.lang = next;
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // storage unavailable
    }
  }, []);

  const value = useMemo<I18n>(() => {
    const t = (key: string, params?: Params) => {
      const found = lookup(DICTIONARIES[language], key) ?? lookup(en, key);
      return typeof found === "string" ? interpolate(found, params) : key;
    };
    const locale = LOCALES[language];
    return {
      language,
      setLanguage,
      t,
      list: <T,>(key: string) => ((lookup(DICTIONARIES[language], key) ?? lookup(en, key) ?? []) as readonly T[]),
      finding: (name) => findingName(language, name),
      taxonomy: (id) => taxonomyLabel(language, id),
      specialty: (id) => specialtyLabel(language, id),
      study: (s) => [s.modality, s.region, s.view].map((id) => taxonomyLabel(language, id)).join(" · "),
      check: (check) => {
        const key = check.code ? `checks.${check.code}` : "";
        const params = Object.fromEntries(
          Object.entries(check.params).map(([k, v]) => [
            k,
            k === "items" ? String(v).split(", ").map((name) => findingName(language, name)).join(", ") : v,
          ]),
        );
        return key && lookup(en, key) ? t(key, params) : check.detail;
      },
      date: (iso, withTime = true) =>
        language === "uz"
          ? uzbekDate(new Date(iso), withTime)
          : new Intl.DateTimeFormat(locale, withTime ? { dateStyle: "medium", timeStyle: "short" } : { dateStyle: "medium" }).format(new Date(iso)),
      weekday: (iso) =>
        language === "uz" ? UZ_WEEKDAYS[new Date(iso).getDay()] : new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(iso)),
      number: (value, digits = 2) => value.toFixed(digits),
      percent: (ratio) => `${Math.round(ratio * 100)}%`,
    };
  }, [language, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18n {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used inside I18nProvider");
  return context;
}

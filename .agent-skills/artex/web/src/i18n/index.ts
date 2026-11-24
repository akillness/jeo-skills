// UI translation layer.
//
// The English source text is the key: t("System logs") looks the string up in the active
// locale's dictionary and falls back to the key itself, so a missing entry shows English
// instead of breaking. Placeholders use {name}: t("{count} lines", { count: 3 }).
//
// The locale is read once when this module loads and never changes while a page is open;
// setLocale() stores the choice and reloads. That keeps t() usable anywhere (components,
// module constants, toasts, non-React helpers) without hooks or re-render plumbing.
//
// To translate the UI into another language, add locales/<code>.json and register it below.

import tr from "./locales/tr.json";
import zhCN from "./locales/zh-CN.json";

export type Locale = "tr" | "en" | "zh-CN";

// Used when nothing is saved and the browser language is not one of LOCALES,
// and for the static prerender, which has no browser.
export const DEFAULT_LOCALE: Locale = "en";

export const LOCALES: { code: Locale; label: string }[] = [
  { code: "tr", label: "Türkçe" },
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
];

const STORAGE_KEY = "artex.locale";

const DICTIONARIES: Record<Locale, Record<string, string>> = {
  tr: tr as Record<string, string>,
  en: {},
  "zh-CN": zhCN as Record<string, string>,
};

const INTL_LOCALES: Record<Locale, string> = {
  tr: "tr-TR",
  en: "en-US",
  "zh-CN": "zh-CN",
};

function detectLocale(): Locale {
  // Prerendering (static export) has no window: it renders the default locale.
  if (typeof window === "undefined") return DEFAULT_LOCALE;
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    const match = LOCALES.find((l) => l.code === saved);
    if (match) return match.code;
  } catch {
    /* storage blocked: fall through to the browser language */
  }
  for (const lang of window.navigator.languages ?? [window.navigator.language]) {
    const tag = lang?.toLowerCase();
    const base = tag?.split("-")[0];
    // Prefer a full BCP 47 match, then the available locale for that language.
    const match =
      LOCALES.find((l) => l.code.toLowerCase() === tag) ??
      LOCALES.find((l) => l.code.toLowerCase().split("-")[0] === base);
    if (match) return match.code;
  }
  return DEFAULT_LOCALE;
}

export const locale: Locale = detectLocale();

if (typeof document !== "undefined") document.documentElement.lang = locale;

/** BCP 47 tag for Intl / toLocaleString calls, e.g. date.toLocaleString(intlLocale). */
export const intlLocale = INTL_LOCALES[locale];

const dict = DICTIONARIES[locale];

export type TVars = Record<string, string | number>;

export function t(key: string, vars?: TVars): string {
  const s = Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : key;
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, name: string) =>
    Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : m,
  );
}

export function setLocale(next: Locale) {
  if (next === locale) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, next);
  } catch {
    /* storage blocked: fall back to browser-language detection on reload */
  }
  window.location.reload();
}

/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * From any language tag a browser, a document, an integrator or an old
 * client sends ("pt_AO", "sr-RS", "iw", "zh-Hant-HK", "az-Latn-AZ") to the
 * roster-style tags that would serve its reader, best first.
 *
 * This is the one place that knows how a language's variants relate: which
 * regions read British English, Latin-American Spanish or European
 * Portuguese, that Serbian has two scripts that do not stand in for each
 * other, that `iw` is Hebrew and `nb`/`nn` read the Norwegian catalogue.
 * It never consults the roster itself: callers pick the first candidate they
 * hold (`localeForTag` the first one on the roster, a per-language table the
 * first one it ships), so a tag starts routing to a locale the moment that
 * locale is added to i18n/locales.ts, and not a moment before.
 */

/** Withdrawn or alternative ISO 639 codes still found in headers and files. */
const LANGUAGE_ALIASES: Readonly<Record<string, string>> = {
  iw: "he",
  in: "id",
  ji: "yi",
  jw: "jv",
  mo: "ro",
  nb: "no",
  nn: "no",
  zsm: "ms",
  // Serbo-Croatian's code, used by old clients for Serbian in Latin script.
  sh: "sr-latn",
};

/** English-speaking regions that read British spelling (en-GB). */
const BRITISH_ENGLISH_REGIONS = new Set([
  "gb", "uk", "ie", "au", "nz", "za", "in", "sg", "hk", "my", "pk", "ng", "ke",
]);

/** Portuguese-speaking regions outside Brazil: European Portuguese (pt-PT). */
const EUROPEAN_PORTUGUESE_REGIONS = new Set([
  "pt", "ao", "mz", "cv", "gw", "st", "tl", "mo", "gq", "lu", "ch",
]);

const TRADITIONAL_CHINESE_MARKS = new Set(["hant", "tw", "hk", "mo"]);

/** Script subtags are four letters (ISO 15924), regions two letters or three digits. */
const isScript = (part: string) => /^[a-z]{4}$/.test(part);
const isRegion = (part: string) => /^(?:[a-z]{2}|\d{3})$/.test(part);

/**
 * The tags that would serve a reader of `raw`, most specific first, in the
 * roster's spelling ("pt-PT", "sr-Latn", "zh-TW"). Empty for nothing
 * readable ("", "*", a malformed tag).
 */
export function localeCandidates(raw: string | null | undefined): string[] {
  const tag = String(raw ?? "").trim().replace(/_/g, "-").toLowerCase();
  if (!tag || tag === "*" || !/^[a-z]{2,3}(?:-[a-z0-9]{1,8})*$/.test(tag)) return [];
  const [head = "", ...tail] = tag.split("-");
  const alias = LANGUAGE_ALIASES[head];
  const [language = "", ...aliasParts] = (alias ?? head).split("-");
  const parts = [...aliasParts, ...tail];
  const script = parts.find(isScript);
  const regions = parts.filter(isRegion);
  const rest = parts.join("-");
  switch (language) {
    case "zh":
      // a Simplified script tag wins over a region (zh-Hans-HK is Simplified)
      if (script === "hans") return ["zh"];
      return parts.some((part) => TRADITIONAL_CHINESE_MARKS.has(part)) ? ["zh-TW", "zh"] : ["zh"];
    case "en":
      return regions.some((region) => BRITISH_ENGLISH_REGIONS.has(region)) ? ["en-GB", "en"] : ["en"];
    case "es":
      // Spanish outside Spain reads the Latin American catalogue (es-419)
      return regions.length === 0 || regions.includes("es") ? ["es"] : ["es-419", "es"];
    case "pt":
      // bare "pt" is Brazilian Portuguese (CLDR likely subtags)
      return regions.some((region) => EUROPEAN_PORTUGUESE_REGIONS.has(region))
        ? ["pt-PT", "pt-BR"]
        : ["pt-BR", "pt-PT"];
    case "sr":
      // Serbian is written in both scripts; Cyrillic is the default (CLDR
      // likely subtags: sr → sr-Cyrl-RS). One script never stands in for
      // the other.
      return [script === "latn" ? "sr-Latn" : "sr-Cyrl"];
    case "az":
      // the roster's Azerbaijani is North Azerbaijani in Latin script
      return script && script !== "latn" ? [] : ["az"];
    case "no":
      return ["no"];
    default: {
      const own = rest ? `${language}-${rest}` : language;
      return own === language ? [language] : [canonicalCase(own), language];
    }
  }
}

/** "sr-latn-rs" → "sr-Latn-RS": BCP 47's conventional casing. */
function canonicalCase(tag: string): string {
  const [language = "", ...parts] = tag.split("-");
  return [
    language,
    ...parts.map((part) =>
      isScript(part) ? part.charAt(0).toUpperCase() + part.slice(1) : isRegion(part) ? part.toUpperCase() : part,
    ),
  ].join("-");
}

/**
 * The first of `available` (matched case-insensitively, returned as listed)
 * that serves a reader of `raw`, or null. For per-language tables: a module
 * set, a list of shipped dictionaries, the roster itself.
 */
export function pickLocale<T extends string>(raw: string | null | undefined, available: readonly T[]): T | null {
  const byLower = new Map(available.map((entry) => [entry.toLowerCase(), entry] as const));
  const exact = byLower.get(String(raw ?? "").trim().replace(/_/g, "-").toLowerCase());
  if (exact) return exact;
  for (const candidate of localeCandidates(raw)) {
    const found = byLower.get(candidate.toLowerCase());
    if (found) return found;
  }
  return null;
}

/**
 * Scripts written right to left (ISO 15924), and the languages whose usual
 * script is one of them. `<html dir>` follows LOCALE_META; this is the
 * reference the roster's `dir` is checked against.
 */
const RTL_SCRIPTS = new Set(["arab", "hebr", "syrc", "thaa", "nkoo", "adlm", "rohg", "mand", "samr"]);
const RTL_LANGUAGES = new Set(["ar", "he", "fa", "ur", "ps", "sd", "ug", "yi", "dv", "ckb", "syr"]);

/** Whether text in `raw` is written right to left. */
export function isRightToLeftTag(raw: string): boolean {
  const tag = raw.trim().replace(/_/g, "-").toLowerCase();
  const [head = "", ...parts] = tag.split("-");
  const language = (LANGUAGE_ALIASES[head] ?? head).split("-")[0] ?? "";
  const script = parts.find(isScript);
  if (script) return RTL_SCRIPTS.has(script);
  return RTL_LANGUAGES.has(language);
}

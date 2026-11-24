/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Word/WPS-grade multilevel outline numbering for ordered lists.
 *
 * An ordered list carries a `listStyleType` attr that selects how its item
 * markers are computed from the nesting depth:
 *
 *   - `decimal`          the default list (Home > Numbering): Word's default
 *                        numbering definition, one number per item, no path,
 *                          level 0 → 1.   level 1 → a)   level 2 → i.   (then repeat)
 *   - `decimal-outline`  the classic legal/technical outline — each level shows
 *                        the FULL hierarchical path joined by ".":
 *                          1.        1.1.        1.1.1.
 *   - `multi-level`      a Word-style mixed scheme that cycles formats by depth:
 *                          level 0 → 1.   level 1 → a.   level 2 → i.   (then repeat)
 *
 * The renderer in the editor uses CSS counters (see styles/note-editor.css);
 * this module is the SINGLE SOURCE OF TRUTH for the marker math so the DOCX
 * exporter, the on-screen rendering and the unit tests all agree on what
 * "1.1.1" / "a." / "i." mean for a given (style, depth, ordinal) triple.
 *
 * PURE: string / integer math only, no DOM, no TipTap runtime.
 */

import {
  AIUEO_FULL_WIDTH,
  AIUEO_HALF_WIDTH,
  capitalise,
  CHINESE_DIGITS,
  chineseCounting,
  chineseCountingThousandList,
  CHOSUNG,
  CIRCLE_ZERO_DIGITS,
  cycle,
  digitByDigit,
  enclosed,
  englishCardinal,
  englishOrdinal,
  GANADA,
  IDEOGRAPH_TRADITIONAL,
  IDEOGRAPH_ZODIAC,
  IROHA_FULL_WIDTH,
  IROHA_HALF_WIDTH,
  KOREAN_DIGITS,
  KOREAN_HANJA_DIGITS,
  koreanNative,
  LOWER_LETTERS,
  lowerRoman,
  ordinalSuffix,
  PLACE_SYSTEMS,
  placeValue,
  series,
  wordLetter,
} from "./wordNumberSystems";
import { normalizePageNumberFormat, renderPageNumber } from "./pageNumberFormat";

export const LIST_STYLE_TYPES = [
  "decimal",
  "decimal-outline",
  "multi-level",
  // Word/WPS "Numbering Library" single-format schemes — every level uses the
  // same marker glyph (like decimal, but lettered / roman):
  //   lower-alpha → a. b. c.    upper-alpha → A. B. C.
  //   lower-roman → i. ii. iii. upper-roman → I. II. III.
  "lower-alpha",
  "upper-alpha",
  "lower-roman",
  "upper-roman",
] as const;

export type ListStyleType = (typeof LIST_STYLE_TYPES)[number];

export const DEFAULT_LIST_STYLE: ListStyleType = "decimal";

/** Coerce an untrusted attr value to a known {@link ListStyleType}. */
export function normalizeListStyleType(value: unknown): ListStyleType {
  return LIST_STYLE_TYPES.includes(value as ListStyleType)
    ? (value as ListStyleType)
    : DEFAULT_LIST_STYLE;
}

/** The ordinal an ordered list counts from when no explicit start is set. */
export const DEFAULT_LIST_START = 1;
/** Upper bound for a user-supplied list start (Word allows huge values; clamp
 * to a sane positive integer so an absurd value can't blow up rendering). */
export const MAX_LIST_START = 10000;

/**
 * Coerce an ordered list's `start` attribute (TipTap stores the first item's
 * ordinal there) to a non-negative integer in [0, {@link MAX_LIST_START}], or
 * null when it is absent / the default 1 / unparseable. Returning null for "1"
 * keeps a normal list byte-stable (no `start` attribute, no `<w:startOverride>`),
 * so only an explicit restart/continue value is ever materialized. Zero is a
 * REAL Word value (`<w:start w:val="0"/>` numbers the first item "0."), so it
 * must survive the round trip instead of collapsing to 1. PURE.
 */
export function normalizeListStart(value: unknown): number | null {
  let n: number | null = null;
  if (typeof value === "number" && Number.isFinite(value)) {
    n = Math.trunc(value);
  } else if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value.trim(), 10);
    if (Number.isFinite(parsed)) n = parsed;
  }
  if (n === null || n < 0 || n === DEFAULT_LIST_START) return null;
  return Math.min(n, MAX_LIST_START);
}

/**
 * Word's default numbering definition: what Home > Numbering writes, levels
 * 1-9 of one `w:abstractNum` (Word for Mac 16.86, Simplified Chinese UI,
 * numbering.xml of a document numbered with the default Numbering button):
 *
 *   level  numFmt       lvlText  lvlJc
 *   1 4 7  decimal      %n.      left
 *   2 5 8  lowerLetter  %n)      left
 *   3 6 9  lowerRoman   %n.      right
 *
 * So Enter + Tab under "1." reads "a)", and Tab again "i.". Word's English UI
 * writes the same formats with "%n." at the lettered levels ("a."), which is
 * the `multi-level` scheme; a document's numbers cannot depend on who views it,
 * so the default list is the definition this product's Word writes.
 */
const WORD_DEFAULT_NUMBERING = "decimal" as const;

/**
 * The OOXML `<w:numFmt w:val>` for the {@link ListStyleType} at a given 0-based
 * nesting level. `decimal-outline` is decimal at every level; the default
 * `decimal` list and the `multi-level` scheme cycle decimal → lowerLetter →
 * lowerRoman by depth, so a 3-deep list reads 1. / a) / i. (1. / a. / i. for
 * `multi-level`), matching the on-screen markers. PURE.
 */
export function numFmtForLevel(style: ListStyleType, level: number): string {
  if (style === "multi-level" || style === WORD_DEFAULT_NUMBERING) {
    switch (((level % 3) + 3) % 3) {
      case 1:
        return "lowerLetter";
      case 2:
        return "lowerRoman";
      default:
        return "decimal";
    }
  }
  // Single-format schemes: the same OOXML numFmt at EVERY level.
  switch (style) {
    case "lower-alpha":
      return "lowerLetter";
    case "upper-alpha":
      return "upperLetter";
    case "lower-roman":
      return "lowerRoman";
    case "upper-roman":
      return "upperRoman";
    default:
      return "decimal";
  }
}

/**
 * The OOXML `<w:lvlText>` template for the {@link ListStyleType} at a given
 * 0-based nesting level — the `%1`..`%9` placeholders Word substitutes with the
 * running counters.
 *
 *   - `decimal`          this level's own counter, ")" after letters: "%2)"
 *   - `decimal-outline`  the full path up to this level:            "%1.%2.%3."
 *   - `multi-level`      this level's own counter in its format:    "%3."
 *
 * (OOXML `%n` is 1-based: level 0 uses `%1`.) PURE.
 */
export function lvlTextForLevel(style: ListStyleType, level: number): string {
  const safe = Math.max(0, Math.floor(level));
  if (style === "decimal-outline") {
    const path: string[] = [];
    for (let i = 0; i <= safe; i += 1) path.push(`%${i + 1}`);
    return `${path.join(".")}.`;
  }
  if (
    style === WORD_DEFAULT_NUMBERING &&
    numFmtForLevel(style, safe) === "lowerLetter"
  )
    return `%${safe + 1})`;
  return `%${safe + 1}.`;
}

/**
 * The OOXML `<w:lvlJc>` of a level: Word's default numbering right-aligns its
 * roman levels (the "i." ends at the number position); every other gallery
 * level starts there. PURE.
 */
export function lvlJcForLevel(style: ListStyleType, level: number): "left" | "right" {
  return style === WORD_DEFAULT_NUMBERING &&
    numFmtForLevel(style, Math.max(0, Math.floor(level))) === "lowerRoman"
    ? "right"
    : "left";
}

/** A 1-based ordinal as a bijective base-26 lowercase letter run (1→a, 27→aa). */
function toLowerLetter(ordinal: number): string {
  let n = Math.max(1, Math.floor(ordinal));
  let out = "";
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = LOWER_LETTERS[rem] + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/**
 * One counter in an OOXML `<w:numFmt>` (ECMA-376 §17.18.59) exactly as Word
 * 16 for Mac draws it (every value here was read back from Word's own PDF):
 * decimal, decimalZero (00, 01 … 10), Word's repeated letters (27 → aa),
 * roman, ordinal (1st), cardinal and ordinal text (One, First), circled and
 * parenthesised digits up to 20, full-width digits, Chinese counting, the
 * heavenly stems and earthly branches. Zero draws nothing in a letter or
 * roman format. "none" draws nothing; any other value falls back to decimal.
 * PURE.
 */
export function formatListOrdinal(numFmt: string, ordinal: number): string {
  const n = Math.max(0, Math.floor(ordinal));
  switch (numFmt) {
    case "none":
      return "";
    case "decimalZero":
      return n < 10 ? `0${n}` : String(n);
    case "lowerLetter":
      return wordLetter(n);
    case "upperLetter":
      return wordLetter(n).toUpperCase();
    case "lowerRoman":
      return n === 0 ? "" : lowerRoman(n);
    case "upperRoman":
      return n === 0 ? "" : lowerRoman(n).toUpperCase();
    case "ordinal":
      return ordinalSuffix(n);
    case "cardinalText":
      return capitalise(englishCardinal(n));
    case "ordinalText":
      return capitalise(englishOrdinal(n));
    case "decimalEnclosedCircle":
      return n >= 1 && n <= 20 ? String.fromCodePoint(0x2460 + n - 1) : String(n);
    case "decimalEnclosedParen":
      return n >= 1 && n <= 20 ? String.fromCodePoint(0x2474 + n - 1) : String(n);
    case "decimalFullWidth":
      return Array.from(String(n), (digit) =>
        String.fromCodePoint(0xff10 + Number(digit)),
      ).join("");
    case "chineseCounting":
      return chineseCounting(n);
    case "chineseCountingThousand":
      return chineseCountingThousandList(n);
    case "ideographTraditional":
      return series(IDEOGRAPH_TRADITIONAL, n);
    case "ideographZodiac":
      return series(IDEOGRAPH_ZODIAC, n);
    case "japaneseCounting":
    case "japaneseLegal":
    case "taiwaneseCountingThousand":
    case "chineseLegalSimplified":
    case "ideographLegalTraditional":
    case "koreanCounting":
      // Word cannot show 1,000,000 or more in these (it prints an error
      // text); a list marker writes the arabic number there.
      return n >= 1_000_000
        ? String(n)
        : (placeValue(PLACE_SYSTEMS[numFmt], n) ?? String(n));
    case "taiwaneseCounting":
      // Word draws it exactly as chineseCounting (○ from 100 on).
      return chineseCounting(n);
    case "taiwaneseDigital":
      return digitByDigit(CIRCLE_ZERO_DIGITS, n);
    case "ideographDigital":
      return digitByDigit(CHINESE_DIGITS, n);
    case "koreanDigital":
      return digitByDigit(KOREAN_DIGITS, n);
    case "koreanDigital2":
      // Word's zero alone is the compatibility ideograph U+F9B2; inside a
      // number it is U+96F6.
      return n === 0 ? "\uF9B2" : digitByDigit(KOREAN_HANJA_DIGITS, n);
    case "koreanLegal":
      // Native Korean numbers to 99, then koreanCounting.
      if (n === 0) return "0";
      if (n < 100) return koreanNative(n);
      return n >= 1_000_000
        ? String(n)
        : (placeValue(PLACE_SYSTEMS.koreanCounting, n) ?? String(n));
    case "decimalEnclosedFullstop":
      return enclosed(0x2488, 20, n);
    case "decimalEnclosedCircleChinese":
      return enclosed(0x2460, 10, n);
    case "ideographEnclosedCircle":
      return enclosed(0x3220, 10, n);
    case "aiueo":
      return cycle(AIUEO_HALF_WIDTH, n);
    case "aiueoFullWidth":
      return cycle(AIUEO_FULL_WIDTH, n);
    case "iroha":
      return cycle(IROHA_HALF_WIDTH, n);
    case "irohaFullWidth":
      return cycle(IROHA_FULL_WIDTH, n);
    case "ganada":
      return cycle(GANADA, n);
    case "chosung":
      return cycle(CHOSUNG, n);
    default:
      // The formats a page number shares with a list marker (hex, chicago,
      // Russian, Hebrew, Arabic, Hindi, Thai, Vietnamese ...) draw from the
      // same tables; where Word's PAGE field prints an error text a list
      // marker writes the arabic number.
      const shared = normalizePageNumberFormat(numFmt);
      return (shared === null ? null : renderPageNumber(shared, n)) ?? String(n);
  }
}

/**
 * Render ONE counter value in the format the {@link ListStyleType} uses at the
 * given level. `ordinal` is 1-based (the first item is 1). PURE.
 */
function renderCounter(style: ListStyleType, level: number, ordinal: number): string {
  switch (numFmtForLevel(style, level)) {
    case "lowerLetter":
      return toLowerLetter(ordinal);
    case "upperLetter":
      return toLowerLetter(ordinal).toUpperCase();
    case "lowerRoman":
      return lowerRoman(ordinal);
    case "upperRoman":
      return lowerRoman(ordinal).toUpperCase();
    default:
      return String(Math.max(1, Math.floor(ordinal)));
  }
}

/**
 * Compute the rendered marker prefix for a list item, given the per-level
 * COUNTER PATH that leads to it. Each entry of `path` is the 0-based ordinal of
 * the ancestor (or self) item WITHIN ITS LEVEL — i.e. the same value a CSS
 * `counter-increment` accrues. The deepest entry is this item.
 *
 *   outlinePrefix("decimal-outline", [0, 0, 0]) === "1.1.1."   (first item at
 *     every level — the canonical 1 / 1.1 / 1.1.1 opening of a legal outline)
 *   outlinePrefix("decimal-outline", [0, 1, 2]) === "1.2.3."   (2nd then 3rd)
 *   outlinePrefix("decimal",         [0, 1, 2]) === "iii."     (last counter only)
 *   outlinePrefix("decimal",         [0, 1])    === "b)"       (Word's letter level)
 *   outlinePrefix("multi-level",     [0, 0, 0]) === "i."       (level 2 → roman)
 *   outlinePrefix("multi-level",     [1])       === "2."       (level 0 → decimal)
 *   outlinePrefix("multi-level",     [0, 1])    === "b."       (level 1 → letter)
 *
 * The leading entries are ignored for `decimal` / `multi-level` (only the
 * deepest counter shows); `decimal-outline` joins every level. The text
 * around the counter is the level's `lvlText` ("." or ")"). PURE.
 */
export function outlinePrefix(style: ListStyleType, path: number[]): string {
  if (path.length === 0) return "";
  const level = path.length - 1;
  if (style === "decimal-outline") {
    const parts = path.map((index, depth) =>
      renderCounter(style, depth, index + 1),
    );
    return `${parts.join(".")}.`;
  }
  // decimal + multi-level show only this level's own counter.
  return lvlTextForLevel(style, level).replace(
    `%${level + 1}`,
    renderCounter(style, level, path[level] + 1),
  );
}

/**
 * The `<w:numFmt w:val>` values a SINGLE-FORMAT {@link ListStyleType} maps to.
 * The inverse of {@link numFmtForLevel} for the schemes whose every level uses
 * one glyph family (Word's "Numbering Library" entries).
 */
const SINGLE_FORMAT_STYLE_BY_NUM_FMT: Record<string, ListStyleType> = {
  decimal: "decimal",
  lowerLetter: "lower-alpha",
  upperLetter: "upper-alpha",
  lowerRoman: "lower-roman",
  upperRoman: "upper-roman",
};

/** How many `%1`..`%9` counter placeholders an OOXML `<w:lvlText>` carries. */
function countLvlTextPlaceholders(lvlText: string | null | undefined): number {
  if (typeof lvlText !== "string") return 0;
  return (lvlText.match(/%[1-9]/g) ?? []).length;
}

/**
 * Classify one OOXML numbering definition's levels into the {@link ListStyleType}
 * the editor renders. `levels` are the ORDERED (non-bullet) levels of a single
 * `<w:num>` instance, indexed by `w:ilvl`.
 *
 * Mirrors Word's own reading of numbering.xml (ECMA-376 §17.9):
 *
 *   0. levels that ARE Word's default numbering definition (1. / a) / i. from
 *      level 1, see {@link numFmtForLevel}) → `decimal`, the default list;
 *   1. a level whose `<w:lvlText>` substitutes MORE THAN ONE counter (the
 *      cumulative "%1.%2." path Word writes for a legal/technical outline)
 *      → `decimal-outline`;
 *   2. otherwise, when EVERY defined level shares one `<w:numFmt>` that the
 *      editor renders directly → that single-format scheme, so a Word list
 *      defined purely as `lowerLetter` imports as "a. b. c." and not as a
 *      decimal (decimal at every level reads `decimal`; where its deeper
 *      levels differ from the default list's, the importer keeps the source
 *      definition);
 *   3. otherwise (formats differ by depth, or an exotic numFmt we do not render)
 *      → `multi-level`, the 1. / a. / i. cycling scheme.
 *
 * The API projection (`_derive_list_number_style` in the DOCX projection) applies
 * the SAME three rules, so the browser and server importers agree. PURE.
 */
export function listStyleTypeForNumberingLevels(
  levels: Iterable<{ numFmt?: string | null; lvlText?: string | null }>,
): ListStyleType {
  const list = [...levels];
  if (
    list.length >= 2 &&
    list.every(
      (level, index) =>
        (level.numFmt ?? "").trim() === numFmtForLevel(WORD_DEFAULT_NUMBERING, index) &&
        level.lvlText === lvlTextForLevel(WORD_DEFAULT_NUMBERING, index),
    )
  )
    return WORD_DEFAULT_NUMBERING;
  const formats = new Set<string>();
  let cumulative = false;
  for (const level of list) {
    const numFmt = (level.numFmt ?? "").trim();
    if (!numFmt || numFmt === "bullet") continue;
    formats.add(numFmt);
    if (countLvlTextPlaceholders(level.lvlText) >= 2) cumulative = true;
  }
  if (cumulative) return "decimal-outline";
  if (formats.size === 1) {
    const only = formats.values().next().value as string;
    const style = SINGLE_FORMAT_STYLE_BY_NUM_FMT[only];
    if (style) return style;
  }
  return formats.size === 0 ? DEFAULT_LIST_STYLE : "multi-level";
}

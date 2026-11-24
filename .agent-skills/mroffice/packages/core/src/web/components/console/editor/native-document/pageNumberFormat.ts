/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * Pure helpers for the document footer's PAGE-NUMBER FORMAT (Word/WPS "Format
 * Page Numbers" / `<w:pgNumType>`): the numbering STYLE the page counter renders
 * in (1/2/3, i/ii/iii, I/II/III, a/b/c, A/B/C, the East Asian styles) and the
 * "Start at N" first-page value. Together they describe how a printed page
 * numbers itself.
 *
 * Kept free of any TipTap/React imports so the numbering math + normalization can
 * be unit-tested in isolation and reused by:
 *   - the DocumentPageSetup node extension (parse/render of the persisted doc
 *     attrs carrying the format + start),
 *   - the DocumentToolbar "Format page numbers" control,
 *   - PagePreview, which paints the live per-page number in the chosen style, and
 *   - the DOCX exporter/importer (`<w:pgNumType w:fmt=… w:start=…/>`).
 *
 * SECURITY: every value is funneled through a CLOSED whitelist (the format token)
 * or a clamp (the start ordinal) on BOTH parse and render, so a malicious page or
 * a stray import can never store an off-whitelist format string or an unbounded
 * start. The rendered glyph is always a closed composition of the fixed digit,
 * letter, word and unit tables below (shared with list numbering through
 * `wordNumberSystems.ts`) or Word's fixed error text, so it can never smuggle
 * markup into the on-screen band or the exported XML.
 */

import {
  AIUEO_FULL_WIDTH,
  AIUEO_HALF_WIDTH,
  CHINESE_DIGITS,
  chineseCounting,
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
  lowerRoman,
  ordinalSuffix,
  PLACE_SYSTEMS,
  type PlaceSystem,
  placeValue,
  repeatedGlyph,
  series,
  wordLetter,
} from "./wordNumberSystems";

/**
 * The page-number numbering styles: every OOXML `w:pgNumType/@w:fmt` value
 * (ECMA-376 Part 1, 17.18.59 ST_NumberFormat), a closed set. The first
 * thirteen are Word for Mac's Format Page Numbers list, in its order (see
 * {@link PAGE_NUMBER_DIALOG_FORMATS} in pageNumberDialogModel.ts); the rest
 * follow the standard's order. Word stores and draws every one of them in a
 * section's page numbers -- `bullet`, `bahtText` and `dollarText` read as
 * decimal, `none` and `custom` show Word's error text -- so a document using
 * any of them imports, displays and exports exactly.
 */
export const PAGE_NUMBER_FORMATS = [
  "decimal",
  "numberInDash",
  "decimalFullWidth",
  "lowerLetter",
  "upperLetter",
  "lowerRoman",
  "upperRoman",
  "ideographLegalTraditional",
  "taiwaneseCountingThousand",
  "chineseCountingThousand",
  "chineseLegalSimplified",
  "ideographTraditional",
  "ideographZodiac",
  "ordinal",
  "cardinalText",
  "ordinalText",
  "hex",
  "chicago",
  "ideographDigital",
  "japaneseCounting",
  "aiueo",
  "iroha",
  "decimalHalfWidth",
  "japaneseLegal",
  "japaneseDigitalTenThousand",
  "decimalEnclosedCircle",
  "decimalFullWidth2",
  "aiueoFullWidth",
  "irohaFullWidth",
  "decimalZero",
  "bullet",
  "ganada",
  "chosung",
  "decimalEnclosedFullstop",
  "decimalEnclosedParen",
  "decimalEnclosedCircleChinese",
  "ideographEnclosedCircle",
  "ideographZodiacTraditional",
  "taiwaneseCounting",
  "taiwaneseDigital",
  "chineseCounting",
  "koreanDigital",
  "koreanCounting",
  "koreanLegal",
  "koreanDigital2",
  "vietnameseCounting",
  "russianLower",
  "russianUpper",
  "none",
  "hebrew1",
  "hebrew2",
  "arabicAlpha",
  "arabicAbjad",
  "hindiVowels",
  "hindiConsonants",
  "hindiNumbers",
  "hindiCounting",
  "thaiLetters",
  "thaiNumbers",
  "thaiCounting",
  "bahtText",
  "dollarText",
  "custom",
] as const;
export type PageNumberFormat = (typeof PAGE_NUMBER_FORMATS)[number];

/** Word's closed `w:pgNumType/@w:chapSep` vocabulary. */
export type PageNumberChapterSeparator =
  | "hyphen"
  | "period"
  | "colon"
  | "emDash"
  | "enDash";

/** Word's page-number dialog exposes chapter styles Heading 1 through 9. */
export const MAX_PAGE_NUMBER_CHAPTER_STYLE = 9;

export const PAGE_NUMBER_CHAPTER_SEPARATORS = [
  "hyphen",
  "period",
  "colon",
  "emDash",
  "enDash",
] as const satisfies readonly PageNumberChapterSeparator[];

/** The default page-number format — Word's plain arabic 1/2/3. */
export const DEFAULT_PAGE_NUMBER_FORMAT: PageNumberFormat = "decimal";

/** The default "start at" page number (Word numbers from 1). */
export const DEFAULT_PAGE_NUMBER_START = 1;

/**
 * Upper bound for the "start at N" value: Word keeps a section's start as a
 * signed 32-bit number (it saves 4294967295 back as -1), so 2147483647 is the
 * largest Start at a Word document holds. Every style that cannot show such a
 * number prints Word's error text instead, so the rendered glyph stays bounded
 * (the longest are the 30-pass letter runs).
 */
export const MAX_PAGE_NUMBER_START = 2_147_483_647;

/**
 * The largest Start at Word's Format Page Numbers dialog accepts: Word for Mac
 * 16.86 takes 2147483646 and keeps the dialog open on 2147483647 (a document
 * may still store 2147483647, which {@link MAX_PAGE_NUMBER_START} admits).
 */
export const MAX_PAGE_NUMBER_DIALOG_START = 2_147_483_646;

/** Defensive cap for an imported zero-based DOCX section ordinal. */
export const MAX_PAGE_NUMBER_START_SECTION = 999;

const PAGE_NUMBER_FORMAT_SET: ReadonlySet<string> = new Set(PAGE_NUMBER_FORMATS);

const PAGE_NUMBER_CHAPTER_SEPARATOR_SET: ReadonlySet<string> = new Set(
  PAGE_NUMBER_CHAPTER_SEPARATORS,
);

/**
 * Coerce an arbitrary value into a whitelisted {@link PageNumberFormat}, or
 * `null` when it is not one of the known tokens. Used at every storage/export/
 * import edge so an off-whitelist string can never be persisted or emitted.
 */
export function normalizePageNumberFormat(
  value: unknown,
): PageNumberFormat | null {
  return typeof value === "string" && PAGE_NUMBER_FORMAT_SET.has(value)
    ? (value as PageNumberFormat)
    : null;
}

/**
 * Coerce an arbitrary value into a valid "start at" ordinal, clamped to
 * [0, {@link MAX_PAGE_NUMBER_START}], or `null` when it is not a finite number
 * (so callers can treat absence as "use the default start of 1"). Word's
 * Start at accepts 0 (a title page numbered 0, so the next page reads 1).
 * Accepts a numeric string (e.g. an HTML input's value) too.
 */
export function normalizePageNumberStart(value: unknown): number | null {
  const n =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(n)) return null;
  const floored = Math.floor(n);
  return Math.min(Math.max(floored, 0), MAX_PAGE_NUMBER_START);
}

/** Normalize Word's Heading 1–9 chapter-number source. */
export function normalizePageNumberChapterStyle(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && /^\d+$/.test(value)
        ? Number(value)
        : NaN;
  return Number.isInteger(numeric) &&
    numeric >= 1 &&
    numeric <= MAX_PAGE_NUMBER_CHAPTER_STYLE
    ? numeric
    : null;
}

/** Normalize the closed `w:chapSep` token set without guessing. */
export function normalizePageNumberChapterSeparator(
  value: unknown,
): PageNumberChapterSeparator | null {
  return typeof value === "string" &&
    PAGE_NUMBER_CHAPTER_SEPARATOR_SET.has(value)
    ? (value as PageNumberChapterSeparator)
    : null;
}

/** Normalize the zero-based section where an imported PAGE footer begins. */
export function normalizePageNumberStartSection(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.min(
    Math.max(Math.floor(value), 0),
    MAX_PAGE_NUMBER_START_SECTION,
  );
}

/**
 * What Word prints in a PAGE field whose number its style cannot show (an
 * upperRoman page past 32767, any `none` page): the text of Word's English
 * UI, which a DOCX also caches. Word for Mac in another UI language prints
 * its own translation; this is the one text the API's renderer
 * (`page_number_formats.py`) writes too.
 */
export const PAGE_NUMBER_FORMAT_ERROR_TEXT =
  "Error! Number cannot be represented in specified format.";

const FULL_WIDTH_DIGITS = "０１２３４５６７８９";
const DEVANAGARI_DIGITS = "\u0966\u0967\u0968\u0969\u096a\u096b\u096c\u096d\u096e\u096f";
const THAI_DIGITS = "\u0e50\u0e51\u0e52\u0e53\u0e54\u0e55\u0e56\u0e57\u0e58\u0e59";
const ZWNJ = "\u200c";
const RLM = "\u200f";

const RUSSIAN_LOWER = Array.from("абвгдежзиклмнопрстуфхцчшщыэюя");
const ARABIC_ALPHA = Array.from("أبتثجحخدذرزسشصضطظعغفقكلمنهوي");
const ARABIC_ABJAD = Array.from("أبجدهوزحطيكلمنسعفصقرشتثخذضظغ");
/** Hebrew letters without final forms (hebrew2's alphabet). */
const HEBREW_LETTERS = Array.from("אבגדהוזחטיכלמנסעפצקרשת");
/** Word's `hindiVowels` draws the consonants... */
const HINDI_CONSONANT_LETTERS = Array.from(
  "\u0915\u0916\u0917\u0918\u0919\u091a\u091b\u091c\u091d\u091e\u091f\u0920\u0921\u0922\u0923\u0924\u0925\u0926\u0927\u0928\u0929\u092a\u092b\u092c\u092d\u092e\u092f\u0930\u0931\u0932\u0933\u0934\u0935\u0936\u0937\u0938\u0939",
);
/** ...and `hindiConsonants` the vowels (the last two are two code points). */
const HINDI_VOWEL_LETTERS = [
  ..."\u0905\u0906\u0907\u0908\u0909\u090a\u090b\u090c\u090d\u090e\u090f\u0910\u0911\u0912\u0913\u0914",
  "\u0905\u0902",
  "\u0905\u0903",
];
const THAI_LETTERS = Array.from(
  "\u0e01\u0e02\u0e04\u0e07\u0e08\u0e09\u0e0a\u0e0b\u0e0c\u0e0d\u0e0e\u0e0f\u0e10\u0e11\u0e12\u0e13\u0e14\u0e15\u0e16\u0e17\u0e18\u0e19\u0e1a\u0e1b\u0e1c\u0e1d\u0e1e\u0e1f\u0e20\u0e21\u0e22\u0e23\u0e25\u0e27\u0e28\u0e29\u0e2a\u0e2b\u0e2c\u0e2d\u0e2e",
);
const CHICAGO_SYMBOLS = ["*", "\u2020", "\u2021", "§"];
/** Word counts at most 255 passes through the four chicago symbols (it shows
 * the pass modulo 30), and draws both Hindi letter styles up to 304 and a
 * blank past that. */
const CHICAGO_MAX = 4 * 255;
const HINDI_LETTERS_MAX = 304;

/** Word's `hindiCounting` words for 0-99 (as Word writes them: a few use the
 * precomposed U+095C, others U+0921 U+093C). */
const HINDI_WORDS = [
  "\u0936\u0942\u0928\u094d\u092f",
  "\u090f\u0915",
  "\u0926\u094b",
  "\u0924\u0940\u0928",
  "\u091a\u093e\u0930",
  "\u092a\u093e\u0901\u091a",
  "\u091b\u0903",
  "\u0938\u093e\u0924",
  "\u0906\u0920",
  "\u0928\u094c",
  "\u0926\u0938",
  "\u0917\u094d\u092f\u093e\u0930\u0939",
  "\u092c\u093e\u0930\u0939",
  "\u0924\u0947\u0930\u0939",
  "\u091a\u094c\u0926\u0939",
  "\u092a\u0902\u0926\u094d\u0930\u0939",
  "\u0938\u094b\u0932\u0939",
  "\u0938\u0924\u094d\u0930\u0939",
  "\u0905\u0920\u094d\u0920\u093e\u0930\u0939",
  "\u0909\u0928\u094d\u0928\u0940\u0938",
  "\u092c\u0940\u0938",
  "\u0907\u0915\u094d\u0915\u0940\u0938",
  "\u092c\u093e\u0908\u0938",
  "\u0924\u0947\u0908\u0938",
  "\u091a\u094c\u092c\u0940\u0938",
  "\u092a\u091a\u094d\u091a\u0940\u0938",
  "\u091b\u092c\u094d\u092c\u0940\u0938",
  "\u0938\u0924\u094d\u0924\u093e\u0908\u0938",
  "\u0905\u0920\u094d\u0920\u093e\u0908\u0938",
  "\u0909\u0928\u094d\u0924\u0940\u0938",
  "\u0924\u0940\u0938",
  "\u0907\u0915\u094d\u0924\u0940\u0938",
  "\u092c\u0924\u094d\u0924\u0940\u0938",
  "\u0924\u0948\u0902\u0924\u0940\u0938",
  "\u091a\u094c\u0902\u0924\u0940\u0938",
  "\u092a\u0948\u0902\u0924\u0940\u0938",
  "\u091b\u0924\u0940\u0938",
  "\u0938\u0948\u0902\u0924\u0940\u0938",
  "\u0905\u0921\u093c\u0924\u0940\u0938",
  "\u0909\u0928\u094d\u0924\u093e\u0932\u0940\u0938",
  "\u091a\u093e\u0932\u0940\u0938",
  "\u0907\u0915\u094d\u0924\u093e\u0932\u0940\u0938",
  "\u092c\u092f\u093e\u0932\u0940\u0938",
  "\u0924\u0948\u0924\u093e\u0932\u0940\u0938",
  "\u091a\u0935\u093e\u0932\u0940\u0938",
  "\u092a\u0948\u0902\u0924\u093e\u0932\u0940\u0938",
  "\u091b\u093f\u092f\u093e\u0932\u0940\u0938",
  "\u0938\u0924\u094d\u0924\u093e\u0932\u0940\u0938",
  "\u0905\u095c\u0924\u093e\u0932\u0940\u0938",
  "\u0909\u0928\u094d\u091a\u093e\u0938",
  "\u092a\u091a\u093e\u0938",
  "\u0907\u0915\u093e\u0935\u0928",
  "\u092c\u093e\u0935\u0928",
  "\u0924\u093f\u0930\u092a\u0928",
  "\u091a\u094c\u0935\u0928",
  "\u092a\u091a\u092a\u0928",
  "\u091b\u092a\u094d\u092a\u0928",
  "\u0938\u0924\u094d\u0924\u093e\u0935\u0928",
  "\u0905\u0920\u094d\u0920\u093e\u0935\u0928",
  "\u0909\u0928\u0938\u0920",
  "\u0938\u093e\u0920",
  "\u0907\u0915\u0938\u0920",
  "\u092c\u093e\u0938\u0920",
  "\u0924\u093f\u0930\u0938\u0920",
  "\u091a\u094c\u0902\u0938\u0920",
  "\u092a\u0948\u0902\u0938\u0920",
  "\u091b\u093f\u092f\u093e\u0938\u0920",
  "\u0938\u095c\u0938\u0920",
  "\u0905\u095c\u0938\u0920",
  "\u0909\u0928\u0939\u0924\u094d\u0924\u0930",
  "\u0938\u0924\u094d\u0924\u0930",
  "\u090f\u0915\u0939\u0924\u094d\u0924\u0930",
  "\u092c\u0939\u0924\u094d\u0924\u0930",
  "\u0924\u093f\u0939\u0924\u094d\u0924\u0930",
  "\u091a\u094c\u0939\u0924\u094d\u0924\u0930",
  "\u092a\u091b\u0924\u094d\u0924\u0930",
  "\u091b\u093f\u0939\u0924\u094d\u0924\u0930",
  "\u0938\u0924\u0939\u0924\u094d\u0924\u0930",
  "\u0905\u0920\u0939\u0924\u094d\u0924\u0930",
  "\u0909\u0928\u094d\u0928\u093e\u0938\u0940",
  "\u0905\u0938\u094d\u0938\u0940",
  "\u0907\u0915\u094d\u092f\u093e\u0938\u0940",
  "\u092c\u092f\u093e\u0938\u0940",
  "\u0924\u093f\u0930\u093e\u0938\u0940",
  "\u091a\u094c\u0930\u093e\u0938\u0940",
  "\u092a\u091a\u093e\u0938\u0940",
  "\u091b\u093f\u092f\u093e\u0938\u0940",
  "\u0938\u0924\u094d\u0924\u093e\u0938\u0940",
  "\u0905\u0920\u094d\u0920\u093e\u0938\u0940",
  "\u0928\u0935\u093e\u0938\u0940",
  "\u0928\u092c\u094d\u092c\u0947",
  "\u0907\u0915\u094d\u092f\u093e\u0928\u0935\u0947",
  "\u092c\u093e\u0928\u0935\u0947",
  "\u0924\u093f\u0930\u093e\u0928\u0935\u0947",
  "\u091a\u094c\u0930\u093e\u0928\u0935\u0947",
  "\u092a\u091b\u093e\u0928\u0935\u0947",
  "\u091b\u094d\u092f\u093e\u0928\u0935\u0947",
  "\u0938\u0924\u094d\u0924\u093e\u0928\u0935\u0947",
  "\u0905\u0920\u094d\u0920\u093e\u0928\u0935\u0947",
  "\u0928\u093f\u0928\u094d\u092f\u093e\u0928\u0935\u0947",
];
const HINDI_HUNDRED = "\u0938\u094c";
const HINDI_THOUSAND = "\u0939\u091c\u093e\u0930";

const THAI_NUMBER_WORDS = [
  "\u0e28\u0e39\u0e19\u0e22\u0e4c",
  "\u0e2b\u0e19\u0e36\u0e48\u0e07",
  "\u0e2a\u0e2d\u0e07",
  "\u0e2a\u0e32\u0e21",
  "\u0e2a\u0e35\u0e48",
  "\u0e2b\u0e49\u0e32",
  "\u0e2b\u0e01",
  "\u0e40\u0e08\u0e47\u0e14",
  "\u0e41\u0e1b\u0e14",
  "\u0e40\u0e01\u0e49\u0e32",
];
/** The place words for 10 to 100000 (sip, roi, phan, muen, saen); millions take lan. */
const THAI_PLACE_WORDS = [
  "",
  "\u0e2a\u0e34\u0e1a",
  "\u0e23\u0e49\u0e2d\u0e22",
  "\u0e1e\u0e31\u0e19",
  "\u0e2b\u0e21\u0e37\u0e48\u0e19",
  "\u0e41\u0e2a\u0e19",
];
const THAI_MILLION = "\u0e25\u0e49\u0e32\u0e19";
const THAI_TWENTY = "\u0e22\u0e35\u0e48";
const THAI_FINAL_ONE = "\u0e40\u0e2d\u0e47\u0e14";

/** Vietnamese number words as Word writes them: the base letter (with its
 * vowel mark) and a COMBINING tone mark, not the precomposed NFC letter. */
const VIETNAMESE_WORDS = [
  "kh\u00f4ng",
  "m\u00f4\u0323t",
  "hai",
  "ba",
  "b\u00f4\u0301n",
  "n\u0103m",
  "sa\u0301u",
  "ba\u0309y",
  "ta\u0301m",
  "chi\u0301n",
];
const VIETNAMESE_TEN = "m\u01b0\u01a1\u0300i";
const VIETNAMESE_TENS = "m\u01b0\u01a1i";
const VIETNAMESE_FINAL_ONE = "m\u00f4\u0301t";
const VIETNAMESE_FINAL_FIVE = "l\u0103m";
const VIETNAMESE_HUNDRED = "tr\u0103m";
const VIETNAMESE_ZERO_TENS = "le\u0309";
const VIETNAMESE_ONE_THOUSAND = "m\u00f4\u0323t nga\u0300n";

/**
 * Word's page counting systems differ from its list ones: the Korean myriad
 * group drops a one only as its first digit or in its ones place (113071
 * 십만삼천칠십일, 1110000 백일십만, as Word prints them) and the Chinese
 * systems write a zero after a myriad group that ends in zero (五十万〇四千).
 */
const PAGE_KOREAN_COUNTING: PlaceSystem = {
  ...PLACE_SYSTEMS.koreanCounting,
  koreanMyriadOnes: true,
};
const PAGE_CHINESE_SYSTEMS = {
  chineseCountingThousand: { ...PLACE_SYSTEMS.chineseCountingThousand, zeroAfterRoundGroup: true },
  chineseLegalSimplified: { ...PLACE_SYSTEMS.chineseLegalSimplified, zeroAfterRoundGroup: true },
  ideographLegalTraditional: { ...PLACE_SYSTEMS.ideographLegalTraditional, zeroAfterRoundGroup: true },
} as const satisfies Record<string, PlaceSystem>;

function hebrewNumeral(n: number): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  let out = hundreds ? "קרש"[hundreds - 1] : "";
  if (rest === 15 || rest === 16) return out + (rest === 15 ? "טו" : "טז");
  if (rest >= 10) out += "יכלמנסעפצ"[Math.floor(rest / 10) - 1];
  if (rest % 10) out += "אבגדהוזחט"[(rest % 10) - 1];
  return out;
}

function hindiCounting(n: number): string {
  if (n >= 10_000) return HINDI_WORDS[0];
  if (n < 100) return HINDI_WORDS[n];
  const parts: string[] = [];
  if (n >= 1000) parts.push(`${HINDI_WORDS[Math.floor(n / 1000)]} ${HINDI_THOUSAND}`);
  if (Math.floor(n / 100) % 10) {
    parts.push(`${HINDI_WORDS[Math.floor(n / 100) % 10]} ${HINDI_HUNDRED}`);
  }
  if (n % 100) parts.push(HINDI_WORDS[n % 100]);
  return parts.join(" ");
}

/**
 * 1-999999 in Thai words. A final one reads "et" (THAI_FINAL_ONE) after anything
 * before it (11, 101, 1000001) -- but never in the count of millions
 * (`millions`), which Word writes with "nueng" (81 million: paet-sip-nueng lan).
 */
function thaiBelowMillion(
  n: number,
  afterHigher: boolean,
  millions = false,
): string {
  const digits = Array.from(String(n), Number);
  let out = "";
  digits.forEach((digit, index) => {
    const place = digits.length - 1 - index;
    if (digit === 0) return;
    if (place === 0) {
      out +=
        digit === 1 && !millions && (n > 1 || afterHigher)
          ? THAI_FINAL_ONE
          : THAI_NUMBER_WORDS[digit];
    } else if (place === 1) {
      out +=
        (digit === 1 ? "" : digit === 2 ? THAI_TWENTY : THAI_NUMBER_WORDS[digit]) +
        THAI_PLACE_WORDS[1];
    } else {
      out += THAI_NUMBER_WORDS[digit] + THAI_PLACE_WORDS[place];
    }
  });
  return out;
}

function thaiCounting(n: number): string {
  if (n === 0 || n >= 1_000_000_000) return THAI_NUMBER_WORDS[0];
  const high = Math.floor(n / 1_000_000);
  const low = n % 1_000_000;
  return (
    (high ? thaiBelowMillion(high, false, true) + THAI_MILLION : "") +
    (low ? thaiBelowMillion(low, high > 0) : "")
  );
}

function vietnameseBelowHundred(n: number): string {
  if (n < 10) return VIETNAMESE_WORDS[n];
  const tens = Math.floor(n / 10);
  const ones = n % 10;
  const head =
    tens === 1 ? VIETNAMESE_TEN : `${VIETNAMESE_WORDS[tens]} ${VIETNAMESE_TENS}`;
  if (!ones) return head;
  const tail =
    ones === 1 && tens >= 2
      ? VIETNAMESE_FINAL_ONE
      : ones === 5
        ? VIETNAMESE_FINAL_FIVE
        : VIETNAMESE_WORDS[ones];
  return `${head} ${tail}`;
}

/** Word writes 1000 as "mot ngan" and every larger number as "khong" (zero). */
function vietnameseCounting(n: number): string {
  if (n === 1000) return VIETNAMESE_ONE_THOUSAND;
  if (n > 1000) return VIETNAMESE_WORDS[0];
  if (n < 100) return vietnameseBelowHundred(n);
  const rest = n % 100;
  const head = `${VIETNAMESE_WORDS[Math.floor(n / 100)]} ${VIETNAMESE_HUNDRED}`;
  if (!rest) return head;
  return rest < 10
    ? `${head} ${VIETNAMESE_ZERO_TENS} ${VIETNAMESE_WORDS[rest]}`
    : `${head} ${vietnameseBelowHundred(rest)}`;
}

/**
 * One page number in a style, or null where Word prints its error text
 * instead. Every range and zero below is Word 16.86 for Mac's own output
 * (PAGE fields in sections that start at each value, updated by Word): see
 * apps/web/lib/word-page-number-format.measured.json.
 */
export function renderPageNumber(format: PageNumberFormat, n: number): string | null {
  switch (format) {
    case "decimal":
    case "decimalHalfWidth":
    case "bullet":
    case "bahtText":
    case "dollarText":
      return String(n);
    case "numberInDash":
      return `- ${n} -`;
    case "decimalFullWidth":
    case "decimalFullWidth2":
      return digitByDigit(FULL_WIDTH_DIGITS, n);
    case "decimalZero":
      return n < 10 ? `0${n}` : String(n);
    case "lowerLetter":
    case "upperLetter": {
      // Zero is a blank; past 30 passes through the alphabet, an error.
      if (n === 0) return " ";
      if (n > 26 * 30) return null;
      const letters = wordLetter(n);
      return format === "upperLetter" ? letters.toUpperCase() : letters;
    }
    case "lowerRoman":
    case "upperRoman": {
      if (n === 0) return " ";
      if (n > 32_767) return null;
      const roman = lowerRoman(n);
      return format === "upperRoman" ? roman.toUpperCase() : roman;
    }
    case "russianLower":
    case "russianUpper": {
      if (n === 0) return " ";
      if (n > RUSSIAN_LOWER.length * 30) return null;
      const letters = repeatedGlyph(RUSSIAN_LOWER, n, 30);
      return format === "russianUpper" ? letters.toUpperCase() : letters;
    }
    case "ordinal":
      return ordinalSuffix(n);
    case "cardinalText":
      return n < 1_000_000 ? englishCardinal(n) : null;
    case "ordinalText":
      return n < 1_000_000 ? englishOrdinal(n) : null;
    case "hex":
      return n <= 0xffff ? n.toString(16).toUpperCase() : null;
    case "chicago":
      return n === 0 || n > CHICAGO_MAX
        ? null
        : repeatedGlyph(CHICAGO_SYMBOLS, n, 30);
    case "ideographDigital":
      return digitByDigit(CHINESE_DIGITS, n);
    case "japaneseDigitalTenThousand":
      return n <= 9_999 ? digitByDigit(CHINESE_DIGITS, n) : null;
    case "japaneseCounting":
      return n < 1_000_000 ? placeValue(PLACE_SYSTEMS.japaneseCounting, n) : null;
    case "japaneseLegal":
      return placeValue(PLACE_SYSTEMS.japaneseLegal, n);
    case "chineseCountingThousand":
    case "chineseLegalSimplified":
    case "ideographLegalTraditional":
      return n < 1_000_000 ? placeValue(PAGE_CHINESE_SYSTEMS[format], n) : null;
    case "koreanCounting":
      return n < 1_000_000 ? placeValue(PAGE_KOREAN_COUNTING, n) : null;
    case "koreanLegal":
      if (n === 0) return "0";
      if (n < 100) return koreanNative(n);
      return n < 10_000_000 ? placeValue(PAGE_KOREAN_COUNTING, n) : null;
    case "koreanDigital":
      return digitByDigit(KOREAN_DIGITS, n);
    case "koreanDigital2":
      if (n >= 1_000_000) return null;
      // Zero alone is the compatibility ideograph U+F9B2 (as in a list).
      return n === 0 ? "\uf9b2" : digitByDigit(KOREAN_HANJA_DIGITS, n);
    case "taiwaneseCountingThousand":
    case "taiwaneseDigital":
      // On a page Word writes taiwaneseCountingThousand digit by digit.
      return digitByDigit(CIRCLE_ZERO_DIGITS, n);
    case "chineseCounting":
    case "taiwaneseCounting":
      return chineseCounting(n);
    case "ideographTraditional":
      return series(IDEOGRAPH_TRADITIONAL, n);
    case "ideographZodiac":
      return series(IDEOGRAPH_ZODIAC, n);
    case "ideographZodiacTraditional":
      // The sexagenary cycle: stem and branch together, every 60.
      return n === 0
        ? "0"
        : IDEOGRAPH_TRADITIONAL[(n - 1) % 10] + IDEOGRAPH_ZODIAC[(n - 1) % 12];
    case "decimalEnclosedCircle":
      return enclosed(0x2460, 20, n);
    case "decimalEnclosedParen":
      return enclosed(0x2474, 20, n);
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
    case "vietnameseCounting":
      return vietnameseCounting(n);
    case "hebrew1":
      return n >= 1 && n <= 392 ? hebrewNumeral(n) : null;
    case "hebrew2":
      if (n < 1 || n > 392) return null;
      return (
        RLM +
        "ת".repeat(Math.floor((n - 1) / 22)) +
        HEBREW_LETTERS[(n - 1) % 22]
      );
    case "arabicAlpha":
      return n === 0 ? null : repeatedGlyph(ARABIC_ALPHA, n, 14, ZWNJ);
    case "arabicAbjad":
      return n === 0 ? null : repeatedGlyph(ARABIC_ABJAD, n, 14, ZWNJ, true);
    case "hindiVowels":
      return n === 0 || n > HINDI_LETTERS_MAX
        ? " "
        : repeatedGlyph(HINDI_CONSONANT_LETTERS, n, 30);
    case "hindiConsonants":
      return n === 0 || n > HINDI_LETTERS_MAX
        ? " "
        : repeatedGlyph(HINDI_VOWEL_LETTERS, n, 30);
    case "hindiNumbers":
      return n === 0 || n > 32_767 ? null : digitByDigit(DEVANAGARI_DIGITS, n);
    case "hindiCounting":
      return hindiCounting(n);
    case "thaiLetters":
      return n === 0 || n > THAI_LETTERS.length * 30
        ? " "
        : repeatedGlyph(THAI_LETTERS, n, 30);
    case "thaiNumbers":
      return n === 0 || n > 32_767 ? null : digitByDigit(THAI_DIGITS, n);
    case "thaiCounting":
      return thaiCounting(n);
    case "none":
    case "custom":
      return null;
  }
}

/**
 * Render ONE page number in the given {@link PageNumberFormat}, exactly as
 * Word prints it, including Word's error text where the style cannot show the
 * number (and Word's blank for page 0 in the letter and roman styles). An
 * off-whitelist/absent format renders as decimal, Word's default. The result
 * is a closed composition of the fixed tables above (or the error text), so
 * it is safe in the on-screen band and in an XML text node. PURE.
 *
 *   formatPageNumber("decimal", 5)      === "5"
 *   formatPageNumber("lowerRoman", 4)   === "iv"
 *   formatPageNumber("lowerLetter", 28) === "bb"
 *   formatPageNumber("upperRoman", 40000) === PAGE_NUMBER_FORMAT_ERROR_TEXT
 */
export function formatPageNumber(
  format: PageNumberFormat | null | undefined,
  ordinal: number,
): string {
  const resolved = normalizePageNumberFormat(format) ?? DEFAULT_PAGE_NUMBER_FORMAT;
  const floored = Math.floor(Number(ordinal));
  // A forged negative or non-number ordinal reads as page 1.
  const n = Number.isFinite(floored) && floored >= 0 ? floored : 1;
  return renderPageNumber(resolved, n) ?? PAGE_NUMBER_FORMAT_ERROR_TEXT;
}

/**
 * Resolve the printed page number a 0-based page INDEX shows, given the document
 * "start at" value and the chosen format. The first page (index 0) shows the
 * start value; subsequent pages increment by one. Returns the rendered glyph.
 *
 *   pageNumberLabel(0, 1, "decimal")     === "1"
 *   pageNumberLabel(2, 1, "decimal")     === "3"
 *   pageNumberLabel(0, 5, "decimal")     === "5"   (start at 5)
 *   pageNumberLabel(1, 1, "lowerRoman")  === "ii"
 *
 * PURE — drives both the on-screen page preview and the unit tests.
 */
export function pageNumberLabel(
  pageIndex: number,
  start: number | null | undefined,
  format: PageNumberFormat | null | undefined,
): string {
  const startAt = normalizePageNumberStart(start) ?? DEFAULT_PAGE_NUMBER_START;
  const safeIndex = Math.max(0, Math.floor(Number(pageIndex) || 0));
  return formatPageNumber(format, startAt + safeIndex);
}

/** One editable structural sheet's position in the physical paper stream. */
export interface PhysicalSheetPageNumberInput {
  /** One-based physical page occupied by the sheet's first fragment. */
  physicalStart: number;
  /** Physical pages represented by this editable sheet (always at least one). */
  span: number;
  /** Zero-based Word/WPS section owning the sheet. */
  sectionIndex: number;
  /** The sheet's section began on the sheet before, under its top (a
   * continuous break mid-page). */
  sectionContinues?: boolean;
}

/** Formatted PAGE labels for the first/last fragment of one structural sheet. */
export interface PhysicalSheetPageNumberLabels {
  /** `null` means this sheet precedes the section where numbering begins. */
  first: string | null;
  last: string | null;
  /** The number the sheet's first page has (a section's Start at restarts
   * it): Word picks the odd or even header by it. */
  firstNumber?: number;
}

/**
 * Resolve Word/WPS page-number restart semantics against structural sheets.
 *
 * Physical parity fillers are absent from the editable sheet array, but they
 * are already reflected in `physicalStart`. A filler AFTER numbering begins
 * therefore advances the next label; a filler immediately BEFORE the owning
 * section does not, because that section's first real sheet restarts exactly at
 * `start`. A multi-page sheet exposes both endpoints so headers use its first
 * printed page while footers/pseudo-elements use its last.
 */
export function resolvePhysicalSheetPageNumberLabels(
  sheets: ReadonlyArray<PhysicalSheetPageNumberInput>,
  options: {
    format?: PageNumberFormat | null;
    start?: number | null;
    startSection?: number | null;
  } = {},
): PhysicalSheetPageNumberLabels[] {
  const numberedSection =
    normalizePageNumberStartSection(options.startSection) ?? 0;
  const normalized = sheets.map((sheet) => ({
    physicalStart: Math.max(1, Math.floor(Number(sheet.physicalStart) || 1)),
    span: Math.max(1, Math.floor(Number(sheet.span) || 1)),
    sectionIndex: Math.max(0, Math.floor(Number(sheet.sectionIndex) || 0)),
  }));
  const firstNumberedSheet = normalized.find(
    (sheet) => sheet.sectionIndex >= numberedSection,
  );
  if (!firstNumberedSheet) {
    return normalized.map(() => ({ first: null, last: null }));
  }

  const firstPhysicalPage = firstNumberedSheet.physicalStart;
  return normalized.map((sheet) => {
    if (sheet.sectionIndex < numberedSection) {
      return { first: null, last: null };
    }
    const firstIndex = Math.max(0, sheet.physicalStart - firstPhysicalPage);
    return {
      first: pageNumberLabel(firstIndex, options.start, options.format),
      last: pageNumberLabel(
        firstIndex + sheet.span - 1,
        options.start,
        options.format,
      ),
    };
  });
}

/** One section's `w:pgNumType` as the section layout stores it. */
export interface SectionPageNumberScheme {
  format?: unknown;
  /** Absent: Continue from previous section. */
  start?: unknown;
  /** Heading 1-9 whose number prefixes the page number (w:chapStyle). */
  chapterStyle?: unknown;
  chapterSeparator?: unknown;
}

/** The glyph each `w:chapSep` draws between chapter and page number. */
export const PAGE_NUMBER_CHAPTER_SEPARATOR_GLYPHS: Readonly<
  Record<PageNumberChapterSeparator, string>
> = {
  hyphen: "-",
  period: ".",
  colon: ":",
  emDash: "—",
  enDash: "–",
};

/** `window.__docsContinuousStartOff = true` asks the older reading (a
 * continuous section's Start at N on its first whole page), for an A/B of
 * one build. */
function continuousStartOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsContinuousStartOff?: boolean}).__docsContinuousStartOff === true;
}

/** `window.__docsFrontMatterCountOff = true` asks the older numbering (a
 * Continue section after unnumbered front matter starts at the
 * document-level start), for an A/B of one build. */
function frontMatterCountOff(): boolean {
  return typeof window !== "undefined" && (window as Window & {__docsFrontMatterCountOff?: boolean}).__docsFrontMatterCountOff === true;
}

/**
 * Word's per-section page numbering over structural sheets: each section
 * numbers in its own format; a section with a Start at value restarts there
 * on its first page, one without continues from the previous section (the
 * first section starts at 1); a section that includes chapter numbers
 * prefixes the number of its chapter heading (`1-3`).
 *
 * `legacy` is the document-level scheme an imported document carries
 * (showPageNumbers): pages before its start section stay unnumbered and its
 * format/start fill in what a section leaves unset, exactly as
 * {@link resolvePhysicalSheetPageNumberLabels} numbers them.
 *
 * `chapters[i]` maps a heading level to the chapter number in effect on
 * sheet i (see pageNumberChapters.ts); a sheet before the first chapter
 * heading shows the bare number.
 */
export function resolveSectionSheetPageNumberLabels(
  sheets: ReadonlyArray<PhysicalSheetPageNumberInput>,
  sections: ReadonlyArray<SectionPageNumberScheme | null | undefined>,
  options: {
    legacy?: {
      format?: PageNumberFormat | null;
      start?: number | null;
      startSection?: number | null;
    } | null;
    chapters?: ReadonlyArray<Readonly<Record<number, string>> | null> | null;
  } = {},
): PhysicalSheetPageNumberLabels[] {
  const legacy = options.legacy ?? null;
  const numberedSection = legacy
    ? (normalizePageNumberStartSection(legacy.startSection) ?? 0)
    : 0;
  // An imported document's front matter is unnumbered only on paper: Word
  // counts its pages, so a numbered section that Continues from the previous
  // section (its own w:pgNumType without w:start) goes on from them, never
  // from the document-level start (corpus R401-D01: sections 1-2 "Start at 3",
  // the third section's first page prints 4, where this printed 1).
  const countsFrontMatter =
    legacy !== null &&
    numberedSection > 0 &&
    sections[numberedSection] != null &&
    normalizePageNumberStart(sections[numberedSection]?.start) === null &&
    !frontMatterCountOff();
  let runBase: number | null = null;
  let runPhysical = 1;
  let currentSection = -1;
  return sheets.map((raw, index) => {
    const physicalStart = Math.max(1, Math.floor(Number(raw.physicalStart) || 1));
    const span = Math.max(1, Math.floor(Number(raw.span) || 1));
    const sectionIndex = Math.max(0, Math.floor(Number(raw.sectionIndex) || 0));
    const frontMatter = sectionIndex < numberedSection;
    if (frontMatter && !countsFrontMatter) return { first: null, last: null };
    const scheme = sections[sectionIndex] ?? null;
    const explicitStart = normalizePageNumberStart(scheme?.start);
    if (runBase === null) {
      runBase =
        explicitStart ??
        (legacy && !countsFrontMatter ? normalizePageNumberStart(legacy.start) : null) ??
        DEFAULT_PAGE_NUMBER_START;
      runPhysical = physicalStart;
    } else if (sectionIndex !== currentSection && explicitStart !== null) {
      runBase = explicitStart;
      // A section that began mid-page (a continuous break) is Start at N on
      // the page it began on, though that page prints the section before's
      // number: Windows Word 16 (probes/pgnum) numbers the pages after a
      // continuous "Start at 10" on page 1 as 11, 12, ...; corpus R441-D01's
      // "Start at 23" on page 1 prints 24 on page 2, where this printed 23.
      runPhysical = raw.sectionContinues === true && !continuousStartOff() ? physicalStart - 1 : physicalStart;
    }
    currentSection = sectionIndex;
    if (frontMatter) return { first: null, last: null };
    // A section's own w:pgNumType without w:fmt numbers in Arabic: Word
    // never carries a format over from another section (tdf164499: Roman
    // front matter, then a section restarting at 1 numbers 1, 2, …). The
    // document-level scheme fills in only for a section that states none.
    const format =
      normalizePageNumberFormat(scheme?.format) ??
      (legacy && !scheme ? normalizePageNumberFormat(legacy.format) : null) ??
      DEFAULT_PAGE_NUMBER_FORMAT;
    const chapterStyle = normalizePageNumberChapterStyle(scheme?.chapterStyle);
    const chapter =
      chapterStyle === null ? undefined : options.chapters?.[index]?.[chapterStyle];
    const prefix = chapter
      ? `${chapter}${
          PAGE_NUMBER_CHAPTER_SEPARATOR_GLYPHS[
            normalizePageNumberChapterSeparator(scheme?.chapterSeparator) ??
              "hyphen"
          ]
        }`
      : "";
    const firstOrdinal = runBase + (physicalStart - runPhysical);
    return {
      first: prefix + formatPageNumber(format, firstOrdinal),
      last: prefix + formatPageNumber(format, firstOrdinal + span - 1),
      firstNumber: firstOrdinal,
    };
  });
}

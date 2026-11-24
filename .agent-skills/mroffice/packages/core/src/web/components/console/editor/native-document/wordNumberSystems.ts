/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * The number systems behind Word's ST_NumberFormat values (ECMA-376 Part 1,
 * 17.18.59), shared by the two places MRAI draws them:
 *
 *   - list markers (`listNumbering.ts` `formatListOrdinal`, a `w:numFmt`), and
 *   - page numbers (`pageNumberFormat.ts` `formatPageNumber`, a
 *     `w:pgNumType/@w:fmt`; mirrored by the API's `page_number_formats.py`).
 *
 * Word does not draw the two alike for every format: a page number is a field
 * result (the PAGE field's numeric formatting), so e.g. `cardinalText` reads
 * "one" on a page but "One" in a list, `taiwaneseCountingThousand` is digit by
 * digit on a page, and each page style has its own range past which Word
 * prints an error text. The per-format choices live with each caller; the
 * glyph tables and the counting systems themselves live here once.
 *
 * PURE: string / integer math only.
 */

export const LOWER_LETTERS = "abcdefghijklmnopqrstuvwxyz";

/**
 * One glyph of an alphabet repeated once per pass through it (27 -> "aa",
 * 53 -> "aaa"): Word's lettered styles. `separator` follows (or, with
 * `separatorFirst`, precedes) every copy -- Word's Arabic styles join their
 * letters with a ZERO WIDTH NON-JOINER. The pass count wraps after `passes`.
 * `n` is 1-based.
 */
export function repeatedGlyph(
  alphabet: readonly string[],
  n: number,
  passes: number,
  separator = "",
  separatorFirst = false,
): string {
  const glyph = alphabet[(n - 1) % alphabet.length];
  const copies = (Math.floor((n - 1) / alphabet.length) % passes) + 1;
  const unit = separatorFirst ? separator + glyph : glyph + separator;
  return unit.repeat(copies);
}

/**
 * Word's lettered counter: the letter of `(n - 1) mod 26`, repeated once per
 * pass through the alphabet (27 -> "aa", 28 -> "bb", 53 -> "aaa"), and the
 * repetition itself wraps after 30 passes. Measured on Word 16 for Mac
 * (40 -> "nn", 99 -> "uuuu", 1000 -> nine "l", 10000 -> 25 "p"). Zero draws
 * nothing. This is not the spreadsheet column run CSS `lower-alpha` uses.
 */
export function wordLetter(n: number): string {
  if (n <= 0) return "";
  return repeatedGlyph(Array.from(LOWER_LETTERS), n, 30);
}

const ROMAN_TABLE: ReadonlyArray<readonly [number, string]> = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/** A positive integer as a lowercase roman numeral (1 -> i, 4 -> iv, 4000 ->
 * mmmm: Word repeats m past 3999). */
export function lowerRoman(ordinal: number): string {
  let n = Math.max(1, Math.floor(ordinal));
  let out = "";
  for (const [value, glyph] of ROMAN_TABLE) {
    while (n >= value) {
      out += glyph;
      n -= value;
    }
  }
  return out;
}

const ENGLISH_ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen",
  "seventeen", "eighteen", "nineteen",
];
const ENGLISH_TENS = [
  "", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
];
const ENGLISH_ORDINAL_WORD: Record<string, string> = {
  zero: "zeroth", one: "first", two: "second", three: "third", five: "fifth",
  eight: "eighth", nine: "ninth", twelve: "twelfth",
};

function englishBelowThousand(n: number): string {
  const parts: string[] = [];
  if (n >= 100) {
    parts.push(`${ENGLISH_ONES[Math.floor(n / 100)]} hundred`);
    n %= 100;
  }
  if (n >= 20) {
    const tens = ENGLISH_TENS[Math.floor(n / 10)];
    parts.push(n % 10 ? `${tens}-${ENGLISH_ONES[n % 10]}` : tens);
  } else if (n > 0) {
    parts.push(ENGLISH_ONES[n]);
  }
  return parts.join(" ");
}

/**
 * Word's English number words, lowercase: "one", "twenty-one", "one hundred
 * one", "twelve thousand three hundred forty-five" -- no "and" (Word 16 for
 * Mac).
 */
export function englishCardinal(n: number): string {
  if (n === 0) return "zero";
  const parts: string[] = [];
  const scales: Array<[number, string]> = [
    [1_000_000_000, "billion"],
    [1_000_000, "million"],
    [1_000, "thousand"],
  ];
  let rest = n;
  for (const [value, name] of scales) {
    if (rest >= value) {
      parts.push(`${englishBelowThousand(Math.floor(rest / value))} ${name}`);
      rest %= value;
    }
  }
  if (rest > 0) parts.push(englishBelowThousand(rest));
  return parts.join(" ");
}

/** The last word made ordinal ("twenty-first", "one hundredth"). */
export function englishOrdinal(n: number): string {
  const words = englishCardinal(n);
  return words.replace(/([a-z]+)$/, (word) => {
    if (ENGLISH_ORDINAL_WORD[word]) return ENGLISH_ORDINAL_WORD[word];
    if (word.endsWith("y")) return `${word.slice(0, -1)}ieth`;
    return `${word}th`;
  });
}

export function capitalise(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Word's `ordinal`: 1st, 2nd, 3rd, 4th, 11th, 12th, 13th, 21st, 111th. */
export function ordinalSuffix(n: number): string {
  const lastTwo = n % 100;
  if (lastTwo >= 11 && lastTwo <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
}

export const CHINESE_DIGITS = "〇一二三四五六七八九";
/** The digit table whose zero is U+25CB (taiwaneseDigital). */
export const CIRCLE_ZERO_DIGITS = "○一二三四五六七八九";

/**
 * Word's `chineseCounting`: 一 … 九, 十 … 九十九 with place words, then digit
 * by digit with ○ for zero from 100 on (100 -> 一○○, 1234 -> 一二三四).
 */
export function chineseCounting(n: number): string {
  if (n === 0) return "○";
  if (n < 10) return CHINESE_DIGITS[n];
  if (n < 100) {
    const tens = Math.floor(n / 10);
    const ones = n % 10;
    return `${tens === 1 ? "" : CHINESE_DIGITS[tens]}十${ones ? CHINESE_DIGITS[ones] : ""}`;
  }
  return Array.from(String(n), (digit) => (digit === "0" ? "○" : CHINESE_DIGITS[Number(digit)])).join("");
}

/** Below 10000 in Chinese place notation; one 〇 stands for skipped places. */
function chinesePlaces(n: number, leadingTen: boolean): string {
  const units = ["", "十", "百", "千"];
  const digits = String(n).padStart(4, "0").split("").map(Number);
  let out = "";
  let pendingZero = false;
  digits.forEach((digit, index) => {
    const place = 3 - index;
    if (digit === 0) {
      if (out) pendingZero = true;
      return;
    }
    if (pendingZero) out += "〇";
    pendingZero = false;
    out +=
      leadingTen && !out && place === 1 && digit === 1
        ? "十"
        : `${CHINESE_DIGITS[digit]}${units[place]}`;
  });
  return out;
}

/**
 * Word's list `chineseCountingThousand`: 十, 十一, 一百〇一, 一百一十, 一千〇一,
 * 一万, 一万二千三百四十五 (Word 16 for Mac).
 */
export function chineseCountingThousandList(n: number): string {
  if (n === 0) return "〇";
  if (n < 10000) return chinesePlaces(n, true);
  const high = Math.floor(n / 10000);
  const low = n % 10000;
  const head = `${chineseCountingThousandList(high)}万`;
  if (low === 0) return head;
  return low < 1000 ? `${head}〇${chinesePlaces(low, false)}` : `${head}${chinesePlaces(low, false)}`;
}

/** A closed counting series (1-based); past its end Word writes decimals. */
export function series(values: string, n: number): string {
  const glyphs = Array.from(values);
  return n >= 1 && n <= glyphs.length ? glyphs[n - 1] : String(n);
}

/**
 * A place-value system of the East Asian number formats: `units` are the
 * tens / hundreds / thousands words, `myriad` the ten-thousand word and
 * `hundredMillion` (when the system has one) the 10^8 word.
 */
export interface PlaceSystem {
  /** Index 0 is the zero glyph (the whole number 0). */
  readonly digits: string;
  readonly units: readonly [string, string, string];
  readonly myriad: string;
  readonly hundredMillion?: string;
  /** A run of skipped places reads as one zero glyph (一百零一) or nothing
   * (百一). */
  readonly zeros: "between" | "silent";
  

  readonly bareOne: "never" | "teens" | "units";
  /** 10000 is the bare myriad word (만) instead of one myriad (一万). */
  readonly bareMyriadOne?: boolean;
  /** After a myriad a thousand keeps its one even where `bareOne` drops it
   * (一万一千, 만일천 -- Word's lists and page numbers alike). */
  readonly thousandOneAfterMyriad?: boolean;
  /** Word's Korean page numbers write the myriad group their own way: a one
   * is dropped only as the group's first digit or in its ones place, and kept
   * elsewhere (113071 십만삼천칠십일, 1110000 백일십만). */
  readonly koreanMyriadOnes?: boolean;
  /** A zero glyph also follows a group that ends in a zero (五十万〇四千 --
   * Word's page numbers), not only one before a group below a thousand. */
  readonly zeroAfterRoundGroup?: boolean;
}

export const PLACE_SYSTEMS = {
  japaneseCounting: { digits: "〇一二三四五六七八九", units: ["十", "百", "千"], myriad: "万", zeros: "silent", bareOne: "units", thousandOneAfterMyriad: true },
  japaneseLegal: { digits: "〇壱弐参四伍六七八九", units: ["拾", "百", "阡"], myriad: "萬", hundredMillion: "億", zeros: "silent", bareOne: "never" },
  taiwaneseCountingThousand: { digits: "零一二三四五六七八九", units: ["十", "百", "千"], myriad: "萬", zeros: "between", bareOne: "teens" },
  chineseCountingThousand: { digits: "〇一二三四五六七八九", units: ["十", "百", "千"], myriad: "万", zeros: "between", bareOne: "teens" },
  chineseLegalSimplified: { digits: "零壹贰叁肆伍陆柒捌玖", units: ["拾", "佰", "仟"], myriad: "萬", zeros: "between", bareOne: "never" },
  ideographLegalTraditional: { digits: "零壹貳參肆伍陸柒捌玖", units: ["拾", "佰", "仟"], myriad: "萬", zeros: "between", bareOne: "never" },
  koreanCounting: { digits: "영일이삼사오육칠팔구", units: ["십", "백", "천"], myriad: "만", zeros: "silent", bareOne: "units", bareMyriadOne: true, thousandOneAfterMyriad: true },
} as const satisfies Record<string, PlaceSystem>;

/** One group of 1-9999 in a place system. */
function placeGroup(
  value: number,
  system: PlaceSystem,
  whole: number,
  afterMyriad: boolean,
  myriadGroup: boolean,
): string {
  const places = [Math.floor(value / 1000) % 10, Math.floor(value / 100) % 10, Math.floor(value / 10) % 10, value % 10];
  const korean = myriadGroup && system.koreanMyriadOnes === true;
  let out = "";
  let pendingZero = false;
  places.forEach((digit, index) => {
    if (digit === 0) {
      if (out) pendingZero = true;
      return;
    }
    if (pendingZero && system.zeros === "between") out += system.digits[0];
    pendingZero = false;
    if (index === 3) {
      if (!(digit === 1 && korean)) out += system.digits[digit];
      return;
    }
    const unit = system.units[2 - index];
    const bare =
      digit === 1 &&
      (korean
        ? out === ""
        : !(index === 0 && afterMyriad && system.thousandOneAfterMyriad) &&
          (system.bareOne === "units" ||
            (system.bareOne === "teens" && index === 2 && whole >= 10 && whole <= 19)));
    out += (bare ? "" : system.digits[digit]) + unit;
  });
  return out;
}

/**
 * `n` in a place system, or null past what the system can write (10^8 without
 * a hundred-million word, 10^12 with one). Word's own range per format is
 * narrower and is the caller's to apply.
 */
export function placeValue(system: PlaceSystem, n: number): string | null {
  if (n === 0) return system.digits[0];
  const groups: Array<[number, string]> = [];
  let rest = n;
  if (system.hundredMillion) {
    if (n >= 1_0000_0000_0000) return null;
    groups.push([Math.floor(rest / 1_0000_0000), system.hundredMillion]);
    rest %= 1_0000_0000;
  } else if (n >= 1_0000_0000) {
    return null;
  }
  groups.push([Math.floor(rest / 10_000), system.myriad], [rest % 10_000, ""]);
  let out = "";
  let wroteHigher = false;
  let higherEndsInZero = false;
  for (const [value, unit] of groups) {
    if (value === 0) continue;
    const afterMyriad = wroteHigher;
    // 10001 一萬零一; the silent systems write 一万一.
    if (
      wroteHigher &&
      system.zeros === "between" &&
      (value < 1000 || (higherEndsInZero && system.zeroAfterRoundGroup))
    ) {
      out += system.digits[0];
    }
    const myriadGroup = unit === system.myriad;
    const bareMyriad = myriadGroup && value === 1 && !wroteHigher && system.bareMyriadOne;
    out += (bareMyriad ? "" : placeGroup(value, system, n, afterMyriad, myriadGroup)) + unit;
    wroteHigher = true;
    higherEndsInZero = value % 10 === 0;
  }
  return out;
}

/** Digit by digit in a digit table (index = digit). */
export function digitByDigit(digits: string, n: number): string {
  return Array.from(String(n), (digit) => digits[Number(digit)]).join("");
}

/** A cycle of glyphs that starts again after its last (Word's kana and
 * Hangul formats); 0 draws "0". */
export function cycle(values: string, n: number): string {
  const glyphs = Array.from(values);
  return n === 0 ? "0" : glyphs[(n - 1) % glyphs.length];
}

/** An enclosed series up to its last value, then arabic numbers. */
export function enclosed(first: number, count: number, n: number): string {
  return n >= 1 && n <= count ? String.fromCodePoint(first + n - 1) : String(n);
}

const KOREAN_NATIVE_ONES = ["", "하나", "둘", "셋", "넷", "다섯", "여섯", "일곱", "여덟", "아홉"];
const KOREAN_NATIVE_TENS = ["", "열", "스물", "서른", "마흔", "쉰", "예순", "일흔", "여든", "아흔"];

/** Native Korean numbers 1-99 (Word's `koreanLegal` below 100). */
export function koreanNative(n: number): string {
  return KOREAN_NATIVE_TENS[Math.floor(n / 10)] + KOREAN_NATIVE_ONES[n % 10];
}

/** The fifty-sound order (Word's `aiueo`), 46 kana. */
export const AIUEO_FULL_WIDTH = "アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン";
export const AIUEO_HALF_WIDTH = "ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜｦﾝ";
/** The iroha order (Word's `iroha`), 48 kana; ヰ and ヱ have no half-width
 * form and stay full width in the half-width series, as Word writes them. */
export const IROHA_FULL_WIDTH = "イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセスン";
export const IROHA_HALF_WIDTH = "ｲﾛﾊﾆﾎﾍﾄﾁﾘﾇﾙｦﾜｶﾖﾀﾚｿﾂﾈﾅﾗﾑｳヰﾉｵｸﾔﾏｹﾌｺｴﾃｱｻｷﾕﾒﾐｼヱﾋﾓｾｽﾝ";
export const GANADA = "가나다라마바사아자차카타파하";
export const CHOSUNG = "ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ";
export const KOREAN_DIGITS = "영일이삼사오육칠팔구";
export const KOREAN_HANJA_DIGITS = "零一二三四五六七八九";

/** Heavenly stems, as Word's `ideographTraditional` writes them. */
export const IDEOGRAPH_TRADITIONAL = "甲乙丙丁戊己庚辛壬癸";
/** Earthly branches, as Word's `ideographZodiac` writes them (its 11th is
 * U+620D 戍, not U+620C 戌). */
export const IDEOGRAPH_ZODIAC = "子丑寅卯辰巳午未申酉戍亥";

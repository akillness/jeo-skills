/*!
 * MR Office - https://mroffice.ai
 * Copyright (C) 2026 MRNote. SPDX-License-Identifier: AGPL-3.0-only
 * Licensed under the GNU AGPL v3 with the additional terms in NOTICE.md.
 */
/**
 * WPS / Word "Insert → Date and Time" catalog.
 *
 * These are native Word field picture switches, not browser-only display
 * presets. The Chinese list is the WPS/Word union observed on macOS. Word's
 * English (United States) language choice replaces that list with a distinct
 * 17-item catalog. Keeping both catalogs closed lets DOCX exporters reject an
 * unknown picture instead of silently substituting one.
 */

export type DocumentDateTimeLocale = "zh-CN" | "en-US";
export type DocumentDateTimeSource = "both" | "wps" | "word";
export type DocumentDateTimeFieldType = "DATE" | "TIME";

interface DocumentDateTimeFormatDefinition {
  id: string;
  picture: string;
  source: DocumentDateTimeSource;
  fieldType: DocumentDateTimeFieldType;
  locales: readonly DocumentDateTimeLocale[];
}

const CHINESE_LOCALE = ["zh-CN"] as const;
const ENGLISH_LOCALE = ["en-US"] as const;

export const DOCUMENT_DATE_TIME_FORMATS = [
  {
    id: "wps-short-date",
    picture: "yyyy-M-d",
    source: "wps",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-date",
    picture: "yyyy年M月d日",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-date-weekday",
    picture: "yyyy年M月d日星期W",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "slash-date",
    picture: "yyyy/M/d",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "short-dotted-date",
    picture: "yy.M.d",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-year-month",
    picture: "yyyy年M月",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "24-hour-seconds",
    picture: "H时m分s秒",
    source: "wps",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "24-hour",
    picture: "H时m分",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "clock-seconds",
    picture: "HH:mm:ss",
    source: "wps",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "ampm-clock",
    picture: "AMPMh时m分",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-numeral-date",
    picture: "EEEE年O月A日",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-numeral-date-weekday",
    picture: "EEEE年O月A日星期W",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "chinese-numeral-year-month",
    picture: "EEEE年O月",
    source: "both",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "english-weekday-in-chinese-date",
    picture: "yyyy'年'M'月'd'日' dddd",
    source: "word",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "12-hour-seconds",
    picture: "h时m分s秒",
    source: "word",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "12-hour",
    picture: "h时m分",
    source: "word",
    fieldType: "TIME",
    locales: CHINESE_LOCALE,
  },
  {
    id: "en-short-date",
    picture: "M/d/yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-long-weekday-date",
    picture: "dddd, MMMM d, yyyy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-long-date",
    picture: "MMMM d, yyyy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-numeric-date",
    picture: "M/d/yyyy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-iso-date",
    picture: "yyyy-MM-dd",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-day-short-month-date",
    picture: "d-MMM-yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-dotted-date",
    picture: "M.d.yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-abbreviated-date",
    picture: "MMM. d, yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-day-month-date",
    picture: "d MMMM yyyy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-month-year",
    picture: "MMMM yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-short-month-year",
    picture: "MMM-yy",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-date-time",
    picture: "M/d/yy h:mm am/pm",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-date-time-seconds",
    picture: "M/d/yy h:mm:ss am/pm",
    source: "word",
    fieldType: "DATE",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-time",
    picture: "h:mm am/pm",
    source: "word",
    fieldType: "TIME",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-time-seconds",
    picture: "h:mm:ss am/pm",
    source: "word",
    fieldType: "TIME",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-24-hour-time",
    picture: "HH:mm",
    source: "word",
    fieldType: "TIME",
    locales: ENGLISH_LOCALE,
  },
  {
    id: "en-24-hour-time-seconds",
    picture: "HH:mm:ss",
    source: "word",
    fieldType: "TIME",
    locales: ENGLISH_LOCALE,
  },
] as const satisfies readonly DocumentDateTimeFormatDefinition[];

export type DocumentDateTimeFormat =
  (typeof DOCUMENT_DATE_TIME_FORMATS)[number];
export type DocumentDateTimePicture =
  (typeof DOCUMENT_DATE_TIME_FORMATS)[number]["picture"];

export const DOCUMENT_DATE_TIME_PICTURES = Object.freeze([
  ...new Set(DOCUMENT_DATE_TIME_FORMATS.map((item) => item.picture)),
]) as readonly DocumentDateTimePicture[];

const CHINESE_DIGITS = [
  "〇",
  "一",
  "二",
  "三",
  "四",
  "五",
  "六",
  "七",
  "八",
  "九",
];
const CHINESE_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];
const ENGLISH_WEEKDAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const ENGLISH_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
const ENGLISH_MONTHS_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function hour12(date: Date): number {
  return date.getHours() % 12 || 12;
}

function chineseDigitSequence(value: number): string {
  return String(value)
    .split("")
    .map((digit) => CHINESE_DIGITS[Number(digit)] ?? "")
    .join("");
}

function chineseCardinal(value: number): string {
  if (value < 10) return CHINESE_DIGITS[value] ?? "";
  const tens = Math.floor(value / 10);
  const ones = value % 10;
  const prefix = tens === 1 ? "" : (CHINESE_DIGITS[tens] ?? "");
  return `${prefix}十${ones === 0 ? "" : (CHINESE_DIGITS[ones] ?? "")}`;
}

function englishWeekday(date: Date): string {
  return ENGLISH_WEEKDAYS[date.getDay()] ?? "";
}

/** Convert printable ASCII to the full-width forms used by WPS's checkbox. */
export function toFullWidthCharacters(value: string): string {
  return [...value]
    .map((character) => {
      const code = character.charCodeAt(0);
      return code >= 0x21 && code <= 0x7e
        ? String.fromCharCode(code + 0xfee0)
        : character;
    })
    .join("");
}

export function hasFullWidthCharacters(value: string): boolean {
  return /[\uff01-\uff5e]/.test(value);
}

export function normalizeDocumentDateTimeLocale(
  value: unknown,
): DocumentDateTimeLocale {
  return value === "en-US" ? "en-US" : "zh-CN";
}

export function documentDateTimeFormatsForLocale(
  locale: DocumentDateTimeLocale,
): readonly DocumentDateTimeFormat[] {
  return DOCUMENT_DATE_TIME_FORMATS.filter((item) =>
    (item.locales as readonly DocumentDateTimeLocale[]).includes(locale),
  );
}

export function documentDateTimeFormat(
  locale: DocumentDateTimeLocale,
  picture: string,
): DocumentDateTimeFormat | undefined {
  return documentDateTimeFormatsForLocale(locale).find(
    (item) => item.picture === picture,
  );
}

/**
 * Infer a dialog language only when the field picture belongs to one catalog.
 * Shared clock pictures intentionally return undefined.
 */
export function documentDateTimeLocaleForPicture(
  picture: string,
): DocumentDateTimeLocale | undefined {
  // These were supported as generic fields before the dialog catalog existed,
  // and OOXML carries no separate language marker for them. Do not invent one
  // during import merely because Word also lists the picture under English.
  if (
    ["M/d/yyyy", "yyyy-MM-dd", "MMMM d, yyyy", "HH:mm", "HH:mm:ss"].includes(
      picture,
    )
  ) {
    return undefined;
  }
  const locales = new Set<DocumentDateTimeLocale>();
  for (const item of DOCUMENT_DATE_TIME_FORMATS) {
    if (item.picture !== picture) continue;
    for (const locale of item.locales) locales.add(locale);
  }
  return locales.size === 1 ? [...locales][0] : undefined;
}

export function isDocumentDateTimePicture(
  value: unknown,
): value is DocumentDateTimePicture {
  return (
    typeof value === "string" &&
    (DOCUMENT_DATE_TIME_PICTURES as readonly string[]).includes(value)
  );
}

/**
 * Resolve a closed Office picture switch without relying on host locale.
 * The selected catalog owns its exact date order, names, padding, and field
 * picture. `locale` remains relevant for the Chinese AMPM variant.
 */
export function formatDocumentDateTime(
  date: Date,
  picture: string,
  options: {
    locale?: DocumentDateTimeLocale;
    fullWidth?: boolean;
  } = {},
): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = date.getMinutes();
  const seconds = date.getSeconds();
  const shortYear = pad2(year % 100);
  const monthName = ENGLISH_MONTHS[date.getMonth()] ?? "";
  const shortMonthName = ENGLISH_MONTHS_SHORT[date.getMonth()] ?? "";
  const meridiem = hours < 12 ? "AM" : "PM";
  const locale = normalizeDocumentDateTimeLocale(options.locale);
  let value: string;

  switch (picture) {
    case "yyyy-M-d":
      value = `${year}-${month}-${day}`;
      break;
    case "yyyy/M/d":
      value = `${year}/${month}/${day}`;
      break;
    case "yyyy年M月d日":
      value = `${year}年${month}月${day}日`;
      break;
    case "yyyy年M月d日星期W":
      value = `${year}年${month}月${day}日星期${CHINESE_WEEKDAYS[date.getDay()]}`;
      break;
    case "yyyy'年'M'月'd'日' dddd":
      value = `${year}年${month}月${day}日 ${englishWeekday(date)}`;
      break;
    case "yy.M.d":
      value = `${shortYear}.${month}.${day}`;
      break;
    case "yyyy年M月":
      value = `${year}年${month}月`;
      break;
    case "H时m分s秒":
      value = `${hours}时${minutes}分${seconds}秒`;
      break;
    case "h时m分s秒":
      value = `${hour12(date)}时${minutes}分${seconds}秒`;
      break;
    case "H时m分":
      value = `${hours}时${minutes}分`;
      break;
    case "h时m分":
      value = `${hour12(date)}时${minutes}分`;
      break;
    case "HH:mm:ss":
      value = `${pad2(hours)}:${pad2(minutes)}:${pad2(seconds)}`;
      break;
    case "HH:mm":
      value = `${pad2(hours)}:${pad2(minutes)}`;
      break;
    case "AMPMh时m分":
      value = `${locale === "zh-CN" ? (hours < 12 ? "上午" : "下午") : meridiem}${hour12(date)}时${minutes}分`;
      break;
    case "EEEE年O月A日":
      value = `${chineseDigitSequence(year)}年${chineseCardinal(month)}月${chineseCardinal(day)}日`;
      break;
    case "EEEE年O月A日星期W":
      value = `${chineseDigitSequence(year)}年${chineseCardinal(month)}月${chineseCardinal(day)}日星期${CHINESE_WEEKDAYS[date.getDay()]}`;
      break;
    case "EEEE年O月":
      value = `${chineseDigitSequence(year)}年${chineseCardinal(month)}月`;
      break;
    case "M/d/yy":
      value = `${month}/${day}/${shortYear}`;
      break;
    case "dddd, MMMM d, yyyy":
      value = `${englishWeekday(date)}, ${monthName} ${day}, ${year}`;
      break;
    case "MMMM d, yyyy":
      value = `${monthName} ${day}, ${year}`;
      break;
    case "M/d/yyyy":
      value = `${month}/${day}/${year}`;
      break;
    case "yyyy-MM-dd":
      value = `${year}-${pad2(month)}-${pad2(day)}`;
      break;
    case "d-MMM-yy":
      value = `${day}-${shortMonthName}-${shortYear}`;
      break;
    case "M.d.yy":
      value = `${month}.${day}.${shortYear}`;
      break;
    case "MMM. d, yy":
      value = `${shortMonthName}. ${day}, ${shortYear}`;
      break;
    case "d MMMM yyyy":
      value = `${day} ${monthName} ${year}`;
      break;
    case "MMMM yy":
      value = `${monthName} ${shortYear}`;
      break;
    case "MMM-yy":
      value = `${shortMonthName}-${shortYear}`;
      break;
    case "M/d/yy h:mm am/pm":
      value = `${month}/${day}/${shortYear} ${hour12(date)}:${pad2(minutes)} ${meridiem}`;
      break;
    case "M/d/yy h:mm:ss am/pm":
      value = `${month}/${day}/${shortYear} ${hour12(date)}:${pad2(minutes)}:${pad2(seconds)} ${meridiem}`;
      break;
    case "h:mm am/pm":
      value = `${hour12(date)}:${pad2(minutes)} ${meridiem}`;
      break;
    case "h:mm:ss am/pm":
      value = `${hour12(date)}:${pad2(minutes)}:${pad2(seconds)} ${meridiem}`;
      break;
    default:
      return "";
  }

  return options.fullWidth ? toFullWidthCharacters(value) : value;
}

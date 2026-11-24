// Reading numbers people type in their locale's format, and the `"start/end"`
// string a range submits as one form value. Pure, so it runs on the server too.
import { numberFormatter } from "./format"
import { decimalsOf, roundTo } from "./steps"

const minusSigns = /[\u2212\u2012\u2013\uFE63\uFF0D]/g
const plusSigns = /[\uFE62\uFF0B]/g
// The full-width digits, comma and period East Asian input methods commit.
const fullWidth = /[\uFF10-\uFF19\uFF0C\uFF0E]/g
const halfWidth = (char: string) =>
  String.fromCharCode(char.charCodeAt(0) - 0xfee0)
// Bidirectional marks and other invisible format characters some locales add.
const formatCharacters = /[\u061C\u200E\u200F\u202A-\u202E\u2066-\u2069]/g
const spaces = /[\s\u00A0\u202F]/g
const apostrophes = /['\u2019]/g

type Symbols = {
  group: string
  decimal: string
  // Currency, percent and unit text, and literals, which carry no number.
  strip: string[]
  // The locale's own digits, mapped to 0-9.
  digits: Map<string, string>
  // Divides parsed values, like 100 for percents, which format 0.5 as 50%.
  divisor: number
  // Values some locales write as a word alone, like Arabic "يومان" for 2 days.
  words: Map<string, number>
}

const symbolCache = new Map<string, Symbols>()

// What a locale's formatted numbers are made of, learned from Intl itself.
function symbolsOf(
  locale: string | undefined,
  options: Intl.NumberFormatOptions
) {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`
  const cached = symbolCache.get(key)
  if (cached) {
    return cached
  }
  const formatter = numberFormatter(locale, options)
  // Long unit and currency names change with the number, in up to six plural
  // forms, and some locales write a small number as a word alone.
  const samples = [-12345.6, 12345.6, 0, 1, 2, 3, 5, 11, 21, 22, 1.5, 0.1]
  const words = new Map<string, number>()
  const parts = samples.flatMap((sample) => {
    const sampleParts = formatter.formatToParts(sample)
    const key = wordKey(formatter.format(sample))
    if (
      Number.isInteger(sample) &&
      sample > 0 &&
      !words.has(key) &&
      !sampleParts.some((part) => part.type === "integer")
    ) {
      words.set(key, sample)
    }
    return sampleParts
  })
  const find = (type: string) => parts.find((part) => part.type === type)?.value
  // Formats that show no decimals or no grouping, like percents, yen or
  // `useGrouping: false`, still read the locale's own separators.
  const numbering = formatter.resolvedOptions().numberingSystem
  const separators = numberFormatter(locale, {
    numberingSystem: numbering,
    minimumFractionDigits: 1,
  }).formatToParts(12345.6)
  const separator = (type: "group" | "decimal") =>
    find(type) ?? separators.find((part) => part.type === type)?.value
  const strip = parts
    .filter((part) =>
      ["currency", "percentSign", "unit", "literal", "plusSign"].includes(
        part.type
      )
    )
    .map((part) => part.value.trim())
    .filter(Boolean)
  const digitFormatter = numberFormatter(locale, {
    useGrouping: false,
    numberingSystem: numbering,
  })
  const digits = new Map<string, string>()
  for (let digit = 0; digit < 10; digit++) {
    digits.set(digitFormatter.format(digit), String(digit))
  }
  const symbols: Symbols = {
    group: separator("group") ?? ",",
    decimal: separator("decimal") ?? ".",
    // Longest first, so "US$" goes before "$".
    strip: [...new Set(strip)].sort((a, b) => b.length - a.length),
    digits,
    divisor: options.style === "percent" ? 100 : 1,
    words,
  }
  symbolCache.set(key, symbols)
  return symbols
}

const wordKey = (text: string) =>
  text
    .replace(formatCharacters, "")
    .replace(minusSigns, "-")
    .replace(spaces, "")

// A value written as a word alone, with the minus sign `formatNumber` adds.
function wordValue(text: string, symbols: Symbols) {
  const key = wordKey(text)
  const negative = key.startsWith("-")
  const value = symbols.words.get(negative ? key.slice(1) : key)
  return value === undefined ? undefined : negative ? -value : value
}

// Accounting formats wrap negatives in parentheses, like ($1,234.56).
const parenthesized = /^\s*\(.*\)\s*$/

// Text reduced to ASCII digits, one "-", and "." as the decimal separator.
function normalize(text: string, symbols: Symbols) {
  let result = text
    .replace(formatCharacters, "")
    .replace(minusSigns, "-")
    .replace(plusSigns, "+")
    .replace(fullWidth, halfWidth)
  const negative = parenthesized.test(result)
  result = Array.from(result, (char) => symbols.digits.get(char) ?? char).join(
    ""
  )
  for (const symbol of symbols.strip) {
    result = result.split(symbol).join("")
  }
  const groupIsSpace = symbols.group.trim() === ""
  const decimalAt = result.indexOf(symbols.decimal)
  if (
    !groupIsSpace &&
    decimalAt !== -1 &&
    result.includes(symbols.group, decimalAt + 1)
  ) {
    return "?"
  }
  result = groupIsSpace
    ? result.replace(spaces, "")
    : result.split(symbols.group).join("").replace(spaces, "")
  // Swiss numbers group with an apostrophe, typed either straight or curly.
  if (symbols.group === "'" || symbols.group === "\u2019") {
    result = result.replace(apostrophes, "")
  }
  if (symbols.decimal !== ".") {
    // "." can only be a decimal point when the locale doesn't use it to group.
    if (symbols.group === ".") {
      result = result.split(".").join("")
    }
    result = result.split(symbols.decimal).join(".")
  }
  // Accounting formats and some locales put the sign last.
  if (/^\d.*-$/.test(result)) {
    result = `-${result.slice(0, -1)}`
  }
  result = result.replace(/^\+/, "")
  return negative ? `-${result.replace(/[()]/g, "")}` : result
}

const complete = /^-?(\d+\.?\d*|\.\d+)$/
const partial = /^-?\d*\.?\d*$/

/**
 * Reads a number typed in a locale's format: its digits, group and decimal
 * separators, minus signs, and currency, percent and unit text. Percent
 * formats divide by 100. Returns null for text that isn't a number.
 * @experimental
 */
function parseNumber(
  text: string,
  locale?: string,
  format?: Intl.NumberFormatOptions
) {
  const symbols = symbolsOf(locale, format ?? {})
  const word = wordValue(text, symbols)
  if (word !== undefined) {
    return word / symbols.divisor
  }
  const normalized = normalize(text, symbols)
  if (!complete.test(normalized)) {
    return null
  }
  const value = Number(normalized) / symbols.divisor
  return Number.isFinite(value)
    ? roundTo(value, decimalsOf(Number(normalized)) + 2)
    : null
}

/**
 * Whether text could still become a number as someone types it, like "-",
 * "1." or "$1,2". Without `allowNegative`, a minus sign isn't accepted.
 * @experimental
 */
function isPartialNumber(
  text: string,
  locale?: string,
  format?: Intl.NumberFormatOptions,
  { allowNegative = true } = {}
) {
  const symbols = symbolsOf(locale, format ?? {})
  const word = wordValue(text, symbols)
  if (word !== undefined) {
    return allowNegative || word >= 0
  }
  const normalized = normalize(text, symbols)
  if (!partial.test(normalized)) {
    return false
  }
  return allowNegative || !normalized.startsWith("-")
}

/** The numbers in a `"start/end"` string, or null when any part isn't one. */
function parseRange(value: string) {
  const parts = value
    .split("/")
    .map((part) => (part.trim() === "" ? NaN : Number(part)))
  return parts.every(Number.isFinite) ? parts : null
}

export { isPartialNumber, parseNumber, parseRange }

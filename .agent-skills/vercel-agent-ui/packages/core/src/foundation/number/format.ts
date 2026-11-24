// Showing numbers in someone's language through `Intl.NumberFormat`, with
// formatters built once per locale and options. Pure, so it runs on the server too.
import { decimalsOf } from "./steps"

/**
 * How values show: `Intl.NumberFormat` options, or a function of the value.
 * @stable
 */
type NumberFormat = Intl.NumberFormatOptions | ((value: number) => string)

const formatters = new Map<string, Intl.NumberFormat>()

/**
 * The `Intl.NumberFormat` for a locale and options, built once and reused,
 * since formatters are slow to build.
 * @experimental
 */
function numberFormatter(
  locale?: string,
  options: Intl.NumberFormatOptions = {}
) {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, options)
    formatters.set(key, formatter)
  }
  return formatter
}

// Reading a formatter's resolved options builds a new object each time, so
// its default decimals are read once.
const defaultDecimals = new WeakMap<Intl.NumberFormat, number>()

function intlDecimals(format: Intl.NumberFormatOptions | undefined) {
  const formatter = numberFormatter(undefined, format)
  let decimals = defaultDecimals.get(formatter)
  if (decimals === undefined) {
    decimals = formatter.resolvedOptions().maximumFractionDigits ?? 0
    defaultDecimals.set(formatter, decimals)
  }
  return decimals
}

// Intl shows at most three decimals by default, which would show 0.0001 as 0.
// Without your own maximum, a value shows its step's decimals, and never fewer
// than Intl would, so yen stay whole and dollars show cents.
function displayOptions(
  format: Intl.NumberFormatOptions | undefined,
  step: number
) {
  const options = { ...format }
  if (
    options.maximumFractionDigits === undefined &&
    options.maximumSignificantDigits === undefined
  ) {
    const decimals = decimalsOf(step) + (options.style === "percent" ? -2 : 0)
    options.maximumFractionDigits = Math.max(
      options.minimumFractionDigits ?? 0,
      decimals,
      intlDecimals(format)
    )
  }
  return options
}

/**
 * A value as people read it: the function's text, or `Intl.NumberFormat` in
 * the locale, like "$1,234.50", "45%" or "1.2K". Empty for null and non-finite values.
 * @experimental
 */
function formatNumber(
  value: number | null,
  locale?: string,
  format?: NumberFormat
) {
  if (value === null || !Number.isFinite(value)) {
    return ""
  }
  if (typeof format === "function") {
    return format(value)
  }
  const formatter = numberFormatter(locale, format)
  const text = formatter.format(value)
  // Some locales write a small number as a word alone and drop its sign, like
  // Arabic "يومان" for 2 and -2 days, so the locale's minus sign goes first.
  if (
    value < 0 &&
    !formatter.formatToParts(value).some((part) => part.type === "integer")
  ) {
    const parts = formatter.formatToParts(-3)
    const sign = parts.findIndex((part) => part.type === "minusSign")
    return `${parts
      .slice(0, sign + 1)
      .map((part) => part.value)
      .join("")}${text}`
  }
  return text
}

/**
 * A range as people read it in a locale, like "$5 – $10" or "5–10%", with what
 * both ends share written once. A format function joins its two texts with a dash.
 * @experimental
 */
function formatNumberRange(
  start: number,
  end: number,
  locale?: string,
  format?: NumberFormat
) {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return ""
  }
  if (typeof format === "function") {
    return `${format(start)} – ${format(end)}`
  }
  // `formatRange` is newer than the ES2022 types, and older engines lack it.
  const formatter = numberFormatter(locale, format) as Intl.NumberFormat & {
    formatRange?: (start: number, end: number) => string
  }
  // Both ends negative share one minus sign in `formatRange`, so -5% to -2%
  // would read "-5–2%", like -5% to 2%.
  if (start < 0 && end < 0) {
    return `${formatter.format(start)} – ${formatter.format(end)}`
  }
  return formatter.formatRange
    ? formatter.formatRange(start, end)
    : `${formatter.format(start)}–${formatter.format(end)}`
}

/**
 * The parts `Intl` formats a value into, like each digit group, the decimal
 * separator and the currency sign, for styling them apart or rolling digits
 * like an odometer. A format function's text is one literal part.
 * @experimental
 */
function formatNumberToParts(
  value: number | null,
  locale?: string,
  format?: NumberFormat
) {
  if (value === null || !Number.isFinite(value)) {
    return [] as Intl.NumberFormatPart[]
  }
  if (typeof format === "function") {
    return [
      { type: "literal", value: format(value) },
    ] as Intl.NumberFormatPart[]
  }
  return numberFormatter(locale, format).formatToParts(value)
}

export {
  displayOptions,
  formatNumber,
  formatNumberRange,
  formatNumberToParts,
  type NumberFormat,
  numberFormatter,
}

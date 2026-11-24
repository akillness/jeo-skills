// Names and labels for calendar dates from `Intl`, which every browser ships
// with the locale data a date library would bundle. Each date is formatted as
// a UTC midnight in UTC, so neither the runtime's time zone nor daylight
// saving can move it to another day.
import { dateParts, type ISODate } from "./plain-date"

// Calendars that share the Gregorian calendar's months and days, so a
// Gregorian grid labelled in them is right: only the year and era differ, as
// in Thai (Buddhist) or Japanese (era) years. A locale that defaults to
// another calendar, like `fa-IR` (Persian), is formatted in the Gregorian one,
// or the heading would name a different month than the grid shows.
const gregorianMonths = new Set([
  "gregory",
  "iso8601",
  "buddhist",
  "japanese",
  "roc",
])

// Making a formatter costs about 25 times more than using one, and a month
// grid formats dozens of labels, so each is made once.
const formatters = new Map<string, Intl.DateTimeFormat>()

/**
 * A cached `Intl.DateTimeFormat` for calendar dates in a locale: UTC, and in a calendar whose months match the Gregorian ones.
 * @stable
 */
function dateFormatter(
  locale?: string,
  options: Intl.DateTimeFormatOptions = {}
) {
  const key = `${locale ?? ""}|${JSON.stringify(options)}`
  let formatter = formatters.get(key)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { ...options, timeZone: "UTC" })
    if (!gregorianMonths.has(formatter.resolvedOptions().calendar)) {
      formatter = new Intl.DateTimeFormat(locale, {
        ...options,
        calendar: "gregory",
        timeZone: "UTC",
      })
    }
    formatters.set(key, formatter)
  }
  return formatter
}

/** The time `Intl` formats for an ISO date: its UTC midnight. */
function utc(date: ISODate) {
  const parts = dateParts(date)
  if (!parts) {
    throw new RangeError(`"${date}" is not an ISO date (YYYY-MM-DD).`)
  }
  const time = new Date(0)
  // `setUTCFullYear` keeps years below 100 as they are, which `Date.UTC` doesn't.
  time.setUTCFullYear(parts.year, parts.month - 1, parts.day)
  return time
}

/**
 * An ISO date as people read it in a locale, like "October 16, 2026" or
 * "16.10.2026". `options` are `Intl.DateTimeFormat`'s; the default is the
 * locale's long date, the label a calendar's day cells use.
 * @stable
 */
function formatDate(
  date: ISODate,
  locale?: string,
  options: Intl.DateTimeFormatOptions = longDate
) {
  return dateFormatter(locale, options).format(utc(date))
}

/**
 * A range of ISO dates as people read it in a locale, like "Oct 16 – 20, 2026".
 * @stable
 */
function formatDateRange(
  start: ISODate,
  end: ISODate,
  locale?: string,
  options: Intl.DateTimeFormatOptions = mediumDate
) {
  // Browsers write plain spaces where Node's ICU writes thin ones, so a label
  // rendered on the server wouldn't match the one the browser hydrates.
  return dateFormatter(locale, options)
    .formatRange(utc(start), utc(end))
    .replace(thinSpaces, " ")
}

/**
 * The parts `Intl` formats an ISO date into, for building a label of your own.
 * @stable
 */
function formatDateToParts(
  date: ISODate,
  locale?: string,
  options: Intl.DateTimeFormatOptions = longDate
) {
  return dateFormatter(locale, options).formatToParts(utc(date))
}

/**
 * The twelve month names in a locale, January first, in the form that stands
 * alone, as in a month select or a heading: "январь" rather than the "января"
 * of "16 января".
 * @stable
 */
function monthNames(
  locale?: string,
  width: "long" | "short" | "narrow" = "long"
) {
  const formatter = dateFormatter(locale, { month: width })
  return Array.from({ length: 12 }, (_, index) =>
    formatter.format(Date.UTC(2026, index, 1))
  )
}

/**
 * The seven weekday names in a locale, starting on `weekStartsOn` (0 for Sunday).
 * @stable
 */
function weekdayNames(
  locale?: string,
  width: "long" | "short" | "narrow" = "short",
  weekStartsOn = 0
) {
  const formatter = dateFormatter(locale, { weekday: width })
  // January 4 2026 was a Sunday.
  return Array.from({ length: 7 }, (_, index) =>
    formatter.format(Date.UTC(2026, 0, 4 + ((weekStartsOn + index) % 7)))
  )
}

/**
 * Today's ISO date in a time zone, like `"America/New_York"`, or in the
 * runtime's own. A server and a browser in different zones can disagree, so
 * render today only on the client, or pass the same zone to both.
 * @stable
 */
function todayDate(timeZone?: string) {
  const parts = todayFormatter(timeZone).formatToParts(Date.now())
  const read = (type: string) => parts.find((part) => part.type === type)!.value
  return `${read("year").padStart(4, "0")}-${read("month")}-${read("day")}`
}

const todayFormatters = new Map<string, Intl.DateTimeFormat>()

function todayFormatter(timeZone: string | undefined) {
  const key = timeZone ?? ""
  let formatter = todayFormatters.get(key)
  if (!formatter) {
    // Pinned to a locale, calendar and digits whose parts read as an ISO date.
    formatter = new Intl.DateTimeFormat("en-US-u-ca-gregory-nu-latn", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    todayFormatters.set(key, formatter)
  }
  return formatter
}

const longDate: Intl.DateTimeFormatOptions = {
  weekday: "long",
  year: "numeric",
  month: "long",
  day: "numeric",
}
const mediumDate: Intl.DateTimeFormatOptions = {
  year: "numeric",
  month: "short",
  day: "numeric",
}
const thinSpaces = /[\u2009\u202F]/g

export {
  dateFormatter,
  formatDate,
  formatDateRange,
  formatDateToParts,
  monthNames,
  todayDate,
  weekdayNames,
}

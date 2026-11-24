// Calendar dates as ISO strings (`YYYY-MM-DD`), with arithmetic on whole day
// numbers. A date has no time and no time zone, so nothing here makes a
// `Date`: a `Date` at midnight shifts a day across time zones and daylight
// saving, which is the most common date picker bug.

/**
 * A calendar date as an ISO 8601 string, `YYYY-MM-DD`, like `"2026-10-16"`. What `<input type="date">` submits.
 * @stable
 */
type ISODate = string

/**
 * A calendar date's fields: a year from 1 to 9999, a month from 1 to 12 and a day from 1.
 * @stable
 */
type DateParts = { year: number; month: number; day: number }

// The first and last dates an ISO string can hold, as day numbers.
const firstDay = toDays(1, 1, 1)
const lastDay = toDays(9999, 12, 31)

/**
 * Whether a value is a real ISO date, like `"2026-10-16"`. `"2026-02-30"` isn't.
 * @stable
 */
function isISODate(value: unknown): value is ISODate {
  return typeof value === "string" && dateParts(value) !== undefined
}

/**
 * The year, month and day of an ISO date, or undefined when it isn't a real date.
 * @stable
 */
function dateParts(date: ISODate | null | undefined) {
  const match = date ? /^(\d{4})-(\d{2})-(\d{2})$/.exec(date) : null
  if (!match) {
    return undefined
  }
  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  }
  return isRealDate(parts) ? parts : undefined
}

/**
 * The ISO date of a year, a month from 1 to 12 and a day, or undefined when there's no such date.
 * @stable
 */
function isoDate(year: number, month: number, day: number) {
  const parts = { year, month, day }
  return isRealDate(parts) ? format(parts) : undefined
}

/**
 * The ISO date of an ISO string, a `Date` (its local year, month and day, as
 * the user saw them) or anything with `year`, `month` and `day`, like a
 * `Temporal.PlainDate`. Undefined for anything else.
 * @stable
 */
function toISODate(value: ISODate | Date | DateParts | null | undefined) {
  if (value == null) {
    return undefined
  }
  if (typeof value === "string") {
    return isISODate(value) ? value : undefined
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? undefined
      : isoDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
  }
  return isoDate(value.year, value.month, value.day)
}

/**
 * The number of days in a month, from 1 to 12, of a year. 0 for a month that doesn't exist.
 * @stable
 */
function daysInMonth(year: number, month: number) {
  return month === 2 && isLeapYear(year) ? 29 : (monthLengths[month - 1] ?? 0)
}

const monthLengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]

/**
 * The date `days` days later, or earlier when negative, kept between years 1 and 9999.
 * @stable
 */
function addDays(date: ISODate, days: number) {
  return fromDays(clampDays(daysOf(date) + days))
}

/**
 * The date `months` months later, or earlier, keeping the day where it can: January 31 plus a month is the last day of February.
 * @stable
 */
function addMonths(date: ISODate, months: number) {
  const { year, month, day } = partsOf(date)
  const index = year * 12 + month - 1 + months
  const nextYear = Math.floor(index / 12)
  if (nextYear < 1) {
    return format(fromDayNumber(firstDay))
  }
  if (nextYear > 9999) {
    return format(fromDayNumber(lastDay))
  }
  const nextMonth = index - nextYear * 12 + 1
  return format({
    year: nextYear,
    month: nextMonth,
    day: Math.min(day, daysInMonth(nextYear, nextMonth)),
  })
}

/**
 * The date `years` years later, or earlier: February 29 becomes February 28 in a common year.
 * @stable
 */
function addYears(date: ISODate, years: number) {
  return addMonths(date, years * 12)
}

/**
 * Days from `from` to `to`: positive when `to` is later.
 * @stable
 */
function daysBetween(from: ISODate, to: ISODate) {
  return daysOf(to) - daysOf(from)
}

/**
 * The day of the week, 0 for Sunday to 6 for Saturday, as `Date#getDay` counts.
 * @stable
 */
function weekday(date: ISODate) {
  // Day 0, January 1 1970, was a Thursday.
  return (((daysOf(date) + 4) % 7) + 7) % 7
}

/**
 * The first day of the week `date` is in, for weeks starting on `weekStartsOn` (0 for Sunday).
 * @stable
 */
function startOfWeek(date: ISODate, weekStartsOn = 0) {
  return addDays(date, -((weekday(date) - weekStartsOn + 7) % 7))
}

/**
 * The last day of the week `date` is in, for weeks starting on `weekStartsOn` (0 for Sunday).
 * @stable
 */
function endOfWeek(date: ISODate, weekStartsOn = 0) {
  return addDays(startOfWeek(date, weekStartsOn), 6)
}

/**
 * The first day of the month `date` is in.
 * @stable
 */
function startOfMonth(date: ISODate) {
  return `${date.slice(0, 8)}01`
}

/**
 * The last day of the month `date` is in.
 * @stable
 */
function endOfMonth(date: ISODate) {
  const { year, month } = partsOf(date)
  return format({ year, month, day: daysInMonth(year, month) })
}

/**
 * Whether two dates are in the same month of the same year.
 * @stable
 */
function isSameMonth(a: ISODate, b: ISODate) {
  return a.slice(0, 7) === b.slice(0, 7)
}

/**
 * `date`, moved onto `min` or `max` when it's outside them. Either bound may be missing.
 * @stable
 */
function clampDate(date: ISODate, min?: ISODate | null, max?: ISODate | null) {
  if (min && date < min) {
    return min
  }
  if (max && date > max) {
    return max
  }
  return date
}

/**
 * The weeks a month shows in a calendar, each seven ISO dates starting on
 * `weekStartsOn` (0 for Sunday). Days of the months around it fill the first
 * and last weeks. With `fixedWeeks`, the default, there are always six, so a
 * calendar keeps its height from month to month.
 * @stable
 */
function monthGrid(
  month: ISODate,
  options: { weekStartsOn?: number; fixedWeeks?: boolean } = {}
) {
  const first = startOfMonth(month)
  const start = daysOf(startOfWeek(first, options.weekStartsOn ?? 0))
  const end = daysOf(endOfMonth(first))
  const count =
    options.fixedWeeks === false ? Math.ceil((end - start + 1) / 7) : 6
  const weeks: ISODate[][] = []
  for (let row = 0; row < count; row++) {
    const week: ISODate[] = []
    for (let column = 0; column < 7; column++) {
      week.push(fromDays(clampDays(start + row * 7 + column)))
    }
    weeks.push(week)
  }
  return weeks
}

// Day numbers count days from January 1 1970 in the proleptic Gregorian
// calendar, using Howard Hinnant's civil-from-days algorithms, which need no
// `Date` and no loops: https://howardhinnant.github.io/date_algorithms.html

function toDays(year: number, month: number, day: number) {
  const shifted = month <= 2 ? year - 1 : year
  const era = Math.floor(shifted / 400)
  const yearOfEra = shifted - era * 400
  const dayOfYear = Math.floor((153 * ((month + 9) % 12) + 2) / 5) + day - 1
  const dayOfEra =
    yearOfEra * 365 +
    Math.floor(yearOfEra / 4) -
    Math.floor(yearOfEra / 100) +
    dayOfYear
  return era * 146097 + dayOfEra - 719468
}

function fromDayNumber(days: number) {
  const shifted = days + 719468
  const era = Math.floor(shifted / 146097)
  const dayOfEra = shifted - era * 146097
  const yearOfEra = Math.floor(
    (dayOfEra -
      Math.floor(dayOfEra / 1460) +
      Math.floor(dayOfEra / 36524) -
      Math.floor(dayOfEra / 146096)) /
      365
  )
  const dayOfYear =
    dayOfEra -
    (365 * yearOfEra + Math.floor(yearOfEra / 4) - Math.floor(yearOfEra / 100))
  const shiftedMonth = Math.floor((5 * dayOfYear + 2) / 153)
  const month = shiftedMonth < 10 ? shiftedMonth + 3 : shiftedMonth - 9
  const day = dayOfYear - Math.floor((153 * shiftedMonth + 2) / 5) + 1
  return { year: yearOfEra + era * 400 + (month <= 2 ? 1 : 0), month, day }
}

const fromDays = (days: number) => format(fromDayNumber(days))

const clampDays = (days: number) => Math.min(Math.max(days, firstDay), lastDay)

function partsOf(date: ISODate) {
  const parts = dateParts(date)
  if (!parts) {
    throw new RangeError(`"${date}" is not an ISO date (YYYY-MM-DD).`)
  }
  return parts
}

function daysOf(date: ISODate) {
  const { year, month, day } = partsOf(date)
  return toDays(year, month, day)
}

const isLeapYear = (year: number) =>
  year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)

function isRealDate({ year, month, day }: DateParts) {
  return (
    Number.isInteger(year) &&
    Number.isInteger(month) &&
    Number.isInteger(day) &&
    year >= 1 &&
    year <= 9999 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= daysInMonth(year, month)
  )
}

const pad = (value: number, length: number) =>
  String(value).padStart(length, "0")

function format({ year, month, day }: DateParts) {
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`
}

export {
  addDays,
  addMonths,
  addYears,
  clampDate,
  dateParts,
  type DateParts,
  daysBetween,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  isISODate,
  isoDate,
  type ISODate,
  isSameMonth,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toISODate,
  weekday,
}

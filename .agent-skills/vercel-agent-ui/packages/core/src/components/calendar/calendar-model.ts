// The calendar's decisions as pure functions of plain values: which dates a
// matcher names, what a key press moves to, what a press selects, and which
// cells a month's grid shows. The primitive calls them; tests call them
// without a DOM.
import {
  addDays,
  addMonths,
  addYears,
  clampDate,
  daysBetween,
  endOfWeek,
  isISODate,
  monthGrid,
  startOfWeek,
  weekday,
  type ISODate,
} from "../../foundation/date/plain-date"

/**
 * A month as `YYYY-MM`, like `"2026-10"`, which is what `<input type="month">` submits.
 * @stable
 */
type ISOMonth = string

/**
 * How many dates a calendar selects: one, any number, or a range from a start to an end.
 * @stable
 */
type CalendarMode = "single" | "multiple" | "range"

/**
 * A calendar's value for each mode: an ISO date, a sorted list of them, or a `[start, end]` range. `null` when nothing is selected.
 * @stable
 */
type CalendarValue<Mode extends CalendarMode = CalendarMode> =
  Mode extends "multiple"
    ? ISODate[]
    : Mode extends "range"
      ? [ISODate, ISODate] | null
      : ISODate | null

/**
 * Dates a calendar shouldn't let anyone pick, as data or a function: an ISO
 * date, `{ from, to }` for the dates between two, inclusive, `{ weekday: [0, 6] }`
 * for weekends (0 is Sunday), `{ before: date }`, `{ after: date }`, a
 * function, or a list of any of these. Data can be generated and sent over the
 * wire; a function can't.
 * @stable
 */
type DateMatcher =
  | ISODate
  | { from: ISODate; to: ISODate }
  | { weekday: readonly number[] }
  | { before: ISODate }
  | { after: ISODate }
  | ((date: ISODate) => boolean)

/**
 * One or more `DateMatcher`s.
 * @stable
 */
type DateMatchers = DateMatcher | readonly DateMatcher[]

/** Whether `date` is one of the dates `matchers` name. */
function matchesDate(date: ISODate, matchers: DateMatchers | null | undefined) {
  if (!matchers) {
    return false
  }
  const list: readonly DateMatcher[] = Array.isArray(matchers)
    ? matchers
    : [matchers as DateMatcher]
  return list.some((matcher) => matchesOne(date, matcher))
}

function matchesOne(date: ISODate, matcher: DateMatcher) {
  if (typeof matcher === "string") {
    return date === matcher
  }
  if (typeof matcher === "function") {
    return matcher(date)
  }
  if ("from" in matcher) {
    return date >= matcher.from && date <= matcher.to
  }
  if ("weekday" in matcher) {
    return matcher.weekday.includes(weekday(date))
  }
  if ("before" in matcher) {
    return date < matcher.before
  }
  return date > matcher.after
}

/** The month a date is in. */
const monthOf = (date: ISODate) => date.slice(0, 7)

/** The month `months` months after `month`, or before when negative. */
const addMonthsTo = (month: ISOMonth, months: number) =>
  monthOf(addMonths(`${month}-01`, months))

/** Whether a value is a month, like `"2026-10"`. */
const isISOMonth = (value: unknown): value is ISOMonth =>
  typeof value === "string" &&
  /^\d{4}-\d{2}$/.test(value) &&
  isISODate(`${value}-01`)

/** The dates a value selects, sorted. A range gives its two ends. */
function selectedDates(value: unknown) {
  if (typeof value === "string") {
    return isISODate(value) ? [value] : []
  }
  if (!Array.isArray(value)) {
    return []
  }
  return value.filter(isISODate).sort()
}

/** A value read for a mode, so a controlled value of the wrong shape can't break the calendar. */
function normalizeValue(mode: CalendarMode, value: unknown) {
  const dates = selectedDates(value)
  if (mode === "multiple") {
    return [...new Set(dates)]
  }
  if (mode === "range") {
    return dates.length === 2
      ? ([dates[0]!, dates[1]!] as [ISODate, ISODate])
      : null
  }
  return dates[0] ?? null
}

/** The rules a range must follow, from the calendar's options. */
type RangeRules = {
  minDays?: number
  maxDays?: number
  /** Whether a range may hold unavailable dates. */
  allowUnavailable: boolean
  isUnavailable: (date: ISODate) => boolean
}

/** Whether `start` to `end` is a range the rules allow. Lengths count both ends: a day to itself is 1. */
function isAllowedRange(start: ISODate, end: ISODate, rules: RangeRules) {
  const length = daysBetween(start, end) + 1
  if (rules.minDays !== undefined && length < rules.minDays) {
    return false
  }
  if (rules.maxDays !== undefined && length > rules.maxDays) {
    return false
  }
  if (rules.allowUnavailable) {
    return true
  }
  for (let date = start; date <= end; date = addDays(date, 1)) {
    if (rules.isUnavailable(date)) {
      return false
    }
  }
  return true
}

/** The range from `anchor` to `date`, whichever comes first, or null when the rules don't allow it. */
function rangeTo(anchor: ISODate, date: ISODate, rules: RangeRules) {
  const range = (date < anchor ? [date, anchor] : [anchor, date]) as [
    ISODate,
    ISODate,
  ]
  return isAllowedRange(range[0], range[1], rules) ? range : null
}

/**
 * What a press on `date` does to a range: with no start yet, it starts one.
 * With a start, any date ends it, the earlier of the two starting it, if the
 * rules allow; one they don't allow keeps the start.
 */
function pressRange(anchor: ISODate | null, date: ISODate, rules: RangeRules) {
  if (anchor === null) {
    return { anchor: date, value: undefined }
  }
  const value = rangeTo(anchor, date, rules)
  return value ? { anchor: null, value } : { anchor, value: undefined }
}

/** Where a key moves focus from `from`, before clamping, or undefined for a key the grid doesn't use. */
function dateForKey(
  event: { key: string; shiftKey?: boolean },
  from: ISODate,
  options: { rtl: boolean; weekStartsOn: number }
) {
  const back = options.rtl ? 1 : -1
  switch (event.key) {
    case "ArrowLeft":
      return addDays(from, back)
    case "ArrowRight":
      return addDays(from, -back)
    case "ArrowUp":
      return addDays(from, -7)
    case "ArrowDown":
      return addDays(from, 7)
    case "Home":
      return startOfWeek(from, options.weekStartsOn)
    case "End":
      return endOfWeek(from, options.weekStartsOn)
    case "PageUp":
      return event.shiftKey ? addYears(from, -1) : addMonths(from, -1)
    case "PageDown":
      return event.shiftKey ? addYears(from, 1) : addMonths(from, 1)
  }
}

/** A key's move, kept within `min` and `max`. Undefined when the key isn't the grid's. */
function moveDate(
  event: { key: string; shiftKey?: boolean },
  from: ISODate,
  options: {
    rtl: boolean
    weekStartsOn: number
    min?: ISODate | null
    max?: ISODate | null
  }
) {
  const to = dateForKey(event, from, options)
  return to === undefined ? undefined : clampDate(to, options.min, options.max)
}

/**
 * The first visible month that shows `date`, given the months shown now:
 * unchanged when it's already in view, else moved by whole pages when
 * `pageBy` is `"page"`, or just far enough when it's `"month"`.
 */
function monthToShow(
  date: ISODate,
  first: ISOMonth,
  count: number,
  pageBy: "month" | "page"
) {
  const target = monthOf(date)
  const last = addMonthsTo(first, count - 1)
  if (target >= first && target <= last) {
    return first
  }
  const offset = monthsBetween(first, target)
  if (pageBy === "page") {
    return addMonthsTo(first, Math.floor(offset / count) * count)
  }
  return target < first ? target : addMonthsTo(target, -(count - 1))
}

/** Whole months from `from` to `to`. */
function monthsBetween(from: ISOMonth, to: ISOMonth) {
  const [fromYear, fromMonth] = from.split("-").map(Number) as [number, number]
  const [toYear, toMonth] = to.split("-").map(Number) as [number, number]
  return (toYear - fromYear) * 12 + toMonth - fromMonth
}

/** A cell of a month grid: its date, and whether it belongs to the months around the grid's. */
type CalendarCell = {
  /** The cell's ISO date. */
  date: ISODate
  /** Whether the date is in the month before or after the grid's. */
  outside: boolean
  /**
   * Whether the cell shows nothing: a date outside the grid's month when
   * outside days are hidden, or one another visible month already shows.
   */
  hidden: boolean
}

/**
 * The weeks of one visible month. Days of the months around it show only at
 * the outer edges of the visible months, since a date appears once on screen:
 * the first month's leading days and the last month's trailing ones.
 */
function gridWeeks(
  month: ISOMonth,
  options: {
    weekStartsOn: number
    fixedWeeks: boolean
    showOutsideDays: boolean
    first: boolean
    last: boolean
  }
) {
  return monthGrid(`${month}-01`, options).map((week) =>
    week.map((date) => {
      const outside = monthOf(date) !== month
      const hidden =
        outside &&
        (!options.showOutsideDays ||
          (date < `${month}-01` ? !options.first : !options.last))
      return { date, outside, hidden }
    })
  )
}

/** The first and last dates a calendar shows. */
function visibleRange(first: ISOMonth, count: number) {
  return {
    start: `${first}-01`,
    end: addDays(`${addMonthsTo(first, count)}-01`, -1),
  }
}

export {
  addMonthsTo,
  type CalendarCell,
  type CalendarMode,
  type CalendarValue,
  type DateMatcher,
  type DateMatchers,
  gridWeeks,
  isAllowedRange,
  isISOMonth,
  type ISOMonth,
  matchesDate,
  monthOf,
  monthToShow,
  moveDate,
  normalizeValue,
  pressRange,
  rangeTo,
  type RangeRules,
  selectedDates,
  visibleRange,
}

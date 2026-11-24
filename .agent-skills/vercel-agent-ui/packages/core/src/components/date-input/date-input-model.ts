// Dates and times as segments: which a locale shows, in what order, and what
// typing, arrow keys and clearing do to them. Values are the strings native
// inputs submit: `YYYY-MM-DD`, `YYYY-MM-DDTHH:mm[:ss]` and `HH:mm[:ss]`.
import { daysInMonth, isoDate } from "../../foundation/date/plain-date"

/**
 * What a segment holds. A `"literal"` is the text between segments, like a slash.
 * @stable
 */
type DateInputSegmentType =
  | "year"
  | "month"
  | "day"
  | "hour"
  | "minute"
  | "second"
  | "dayPeriod"
  | "literal"

/**
 * The smallest unit an input shows. `"day"` shows a date alone, and a time unit adds the time down to it.
 * @stable
 */
type DateInputGranularity = "day" | "hour" | "minute" | "second"

/**
 * A 12 or 24 hour clock.
 * @stable
 */
type HourCycle = 12 | 24

/**
 * One segment, as the root's state lists them in the order the locale shows them.
 * @stable
 */
type DateInputSegmentData = {
  /** Tells segments apart: the type, or `"literal-<n>"` for the text between them. */
  key: string
  type: DateInputSegmentType
  /** What it shows: the number, padded, or AM and PM in the locale. Empty while it holds nothing. */
  text: string
  /** The number it holds, or `null` while empty. AM is 0 and PM is 1. */
  value: number | null
  /** The smallest number it takes. */
  min: number
  /** The largest number it takes, like the days in the month. */
  max: number
  /** Whether it holds nothing yet. */
  empty: boolean
  /** Whether it's a segment you type in, rather than the text between segments. */
  editable: boolean
  /** Its name in the locale, like "month", which names it to assistive technology. */
  label: string
}

type EditableType = Exclude<DateInputSegmentType, "literal">
type Kind = "date" | "time"
type Fields = Record<EditableType, number | null>
type LayoutItem = { type: DateInputSegmentType; text: string }
type Buffer = { type: EditableType; text: string } | null
type Format = {
  kind: Kind
  granularity: DateInputGranularity
  hourCycle: HourCycle
  locale: string
}

const emptyFields = () =>
  ({
    year: null,
    month: null,
    day: null,
    hour: null,
    minute: null,
    second: null,
    dayPeriod: null,
  }) as Fields

const pad = (value: number, length: number) =>
  String(value).padStart(length, "0")
const bidiMarks = /[‎‏؜]/g

// A time input always shows minutes.
function typesOf({ kind, granularity, hourCycle }: Omit<Format, "locale">) {
  const unit = kind === "time" && granularity === "day" ? "minute" : granularity
  const types: EditableType[] = kind === "date" ? ["year", "month", "day"] : []
  if (unit === "day") {
    return types
  }
  types.push("hour")
  if (unit !== "hour") {
    types.push("minute")
  }
  if (unit === "second") {
    types.push("second")
  }
  if (hourCycle === 12) {
    types.push("dayPeriod")
  }
  return types
}

const hourCycles = new Map<string, HourCycle>()

function hourCycleOf(locale: string) {
  let cycle = hourCycles.get(locale)
  if (!cycle) {
    const { hourCycle } = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
    }).resolvedOptions()
    cycle = hourCycle === "h11" || hourCycle === "h12" ? 12 : 24
    hourCycles.set(locale, cycle)
  }
  return cycle
}

const layouts = new Map<string, LayoutItem[]>()

function layoutOf(format: Format) {
  const key = JSON.stringify(format)
  let layout = layouts.get(key)
  if (layout) {
    return layout
  }
  const types = typesOf(format)
  const has = (type: EditableType) => types.includes(type)
  const formatter = new Intl.DateTimeFormat(format.locale, {
    timeZone: "UTC",
    calendar: "gregory",
    numberingSystem: "latn",
    ...(has("year") && { year: "numeric", month: "2-digit", day: "2-digit" }),
    ...(has("hour") && {
      hour: "2-digit",
      hourCycle: format.hourCycle === 12 ? "h12" : "h23",
    }),
    ...(has("minute") && { minute: "2-digit" }),
    ...(has("second") && { second: "2-digit" }),
  })
  layout = []
  for (const part of formatter.formatToParts(Date.UTC(2001, 1, 3, 16, 5, 6))) {
    if (part.type === "literal") {
      // Engines differ on the space before AM or PM, so the server's matches the browser's.
      const text = part.value.replace(bidiMarks, "").replace(/\s/g, " ")
      const last = layout[layout.length - 1]
      if (last?.type === "literal") {
        last.text += text
      } else if (text) {
        layout.push({ type: "literal", text })
      }
    } else if (has(part.type as EditableType)) {
      layout.push({ type: part.type as EditableType, text: "" })
    }
  }
  while (layout[0]?.type === "literal") {
    layout.shift()
  }
  while (layout[layout.length - 1]?.type === "literal") {
    layout.pop()
  }
  layouts.set(key, layout)
  return layout
}

const periodNames = new Map<string, [string, string]>()

function dayPeriodsOf(locale: string) {
  let names = periodNames.get(locale)
  if (!names) {
    const formatter = new Intl.DateTimeFormat(locale, {
      hour: "numeric",
      hourCycle: "h12",
      timeZone: "UTC",
    })
    const name = (hour: number) =>
      formatter
        .formatToParts(Date.UTC(2001, 0, 1, hour))
        .find((part) => part.type === "dayPeriod")?.value
    names = [name(0) ?? "AM", name(12) ?? "PM"]
    periodNames.set(locale, names)
  }
  return names
}

const fieldNames = new Map<string, string>()
const englishNames: Record<EditableType, string> = {
  year: "year",
  month: "month",
  day: "day",
  hour: "hour",
  minute: "minute",
  second: "second",
  dayPeriod: "AM/PM",
}

function labelOf(type: EditableType, locale: string) {
  const key = `${locale}|${type}`
  let name = fieldNames.get(key)
  if (name === undefined) {
    try {
      name =
        new Intl.DisplayNames(locale, { type: "dateTimeField" }).of(type) ??
        englishNames[type]
    } catch {
      name = englishNames[type]
    }
    fieldNames.set(key, name)
  }
  return name
}

// The numbers a segment takes. A day takes what its month has, or 31 before
// the month is known, and February 29 before the year is.
// check-code: allow return-type TypeScript would infer an array instead of a tuple.
function boundsOf(
  type: EditableType,
  fields: Fields,
  hourCycle: HourCycle
): [number, number] {
  switch (type) {
    case "year":
      return [1, 9999]
    case "month":
      return [1, 12]
    case "day":
      return [
        1,
        fields.month === null
          ? 31
          : daysInMonth(fields.year ?? 2000, fields.month),
      ]
    case "hour":
      return hourCycle === 12 ? [1, 12] : [0, 23]
    case "dayPeriod":
      return [0, 1]
    default:
      return [0, 59]
  }
}

const digitsOf = (type: EditableType) => (type === "year" ? 4 : 2)

// A day past its month's end becomes the month's last day, as when a month
// with fewer days is picked.
function clampDay(fields: Fields) {
  if (fields.day === null || fields.month === null) {
    return fields
  }
  const last = daysInMonth(fields.year ?? 2000, fields.month)
  return fields.day > last ? { ...fields, day: last } : fields
}

function textOf(type: EditableType, value: number | null, locale: string) {
  if (value === null) {
    return ""
  }
  if (type === "dayPeriod") {
    return dayPeriodsOf(locale)[value]!
  }
  return pad(value, digitsOf(type))
}

/**
 * The segments an input shows for its fields, in the locale's order. What's
 * being typed shows as typed, unpadded, until the segment is done.
 */
function segmentsOf(format: Format, fields: Fields, buffer: Buffer) {
  let literals = 0
  return layoutOf(format).map(({ type, text }) => {
    if (type === "literal") {
      return {
        key: `literal-${literals++}`,
        type,
        text,
        value: null,
        min: 0,
        max: 0,
        empty: false,
        editable: false,
        label: "",
      }
    }
    const value = fields[type]
    const [min, max] = boundsOf(type, fields, format.hourCycle)
    const typing = buffer?.type === type ? buffer.text : null
    return {
      key: type,
      type,
      text: typing ?? textOf(type, value, format.locale),
      value,
      min,
      max,
      empty: value === null && !typing,
      editable: true,
      label: labelOf(type, format.locale),
    }
  })
}

/**
 * A digit typed into a segment. It adds to what's being typed while the
 * number still fits, else starts over, and the segment is done once no other
 * digit could follow, like "4" for a month or "12" for an hour.
 */
function typeDigit(
  fields: Fields,
  buffer: Buffer,
  type: EditableType,
  digit: string,
  hourCycle: HourCycle
) {
  const [min, max] = boundsOf(type, fields, hourCycle)
  const digits = digitsOf(type)
  let text = buffer?.type === type ? buffer.text + digit : digit
  if (text.length > digits || Number(text) > max) {
    text = digit
  }
  const number = Number(text)
  const done = text.length >= digits || number * 10 > max
  const value = number >= min && number <= max ? number : null
  const next = { ...fields, [type]: value }
  return {
    // 2, 20 and 202 aren't leap years, so a year still being typed keeps February 29.
    fields: type === "year" && !done ? next : clampDay(next),
    buffer: done ? null : { type, text },
    done,
  }
}

/**
 * A letter typed into AM/PM: the period whose name starts with it, in the
 * locale or in English.
 */
function typePeriod(fields: Fields, letter: string, locale: string) {
  const lower = letter.toLowerCase()
  const index = [...dayPeriodsOf(locale)].findIndex((name, at) =>
    [name, at ? "pm" : "am"].some((candidate) =>
      candidate.toLowerCase().startsWith(lower)
    )
  )
  return index === -1 ? undefined : { ...fields, dayPeriod: index }
}

/**
 * Steps a segment by `delta`, wrapping at its ends without touching the
 * others: a minute past 59 is 0, and the hour stays. An empty segment starts
 * at `start`.
 */
function stepField(
  fields: Fields,
  type: EditableType,
  delta: number,
  hourCycle: HourCycle,
  start: number
) {
  const [min, max] = boundsOf(type, fields, hourCycle)
  const current = fields[type]
  const span = max - min + 1
  const value =
    current === null
      ? start
      : min + ((((current - min + delta) % span) + span) % span)
  return clampDay({ ...fields, [type]: value })
}

/** Sets a segment to its smallest or largest number. */
function stepToEnd(
  fields: Fields,
  type: EditableType,
  end: "min" | "max",
  hourCycle: HourCycle
) {
  const [min, max] = boundsOf(type, fields, hourCycle)
  return clampDay({ ...fields, [type]: end === "min" ? min : max })
}

const pageSteps: Record<EditableType, number> = {
  year: 5,
  month: 3,
  day: 7,
  hour: 3,
  minute: 15,
  second: 15,
  dayPeriod: 1,
}

/** The step Page Up and Page Down take in a segment. */
const pageStepOf = (type: EditableType) => pageSteps[type]

/** The value the fields make, or `null` while any segment shown is empty. */
function valueOf(fields: Fields, format: Omit<Format, "locale">) {
  const types = typesOf(format)
  if (types.some((type) => fields[type] === null)) {
    return null
  }
  let date = ""
  if (format.kind === "date") {
    date = isoDate(fields.year!, fields.month!, fields.day!) ?? ""
    if (!date) {
      return null
    }
    if (!types.includes("hour")) {
      return date
    }
  }
  const hour =
    format.hourCycle === 12
      ? (fields.hour! % 12) + (fields.dayPeriod === 1 ? 12 : 0)
      : fields.hour!
  let time = `${pad(hour, 2)}:${pad(fields.minute ?? 0, 2)}`
  if (types.includes("second")) {
    time += `:${pad(fields.second!, 2)}`
  }
  return format.kind === "date" ? `${date}T${time}` : time
}

type Parts = {
  date?: { year: number; month: number; day: number }
  hour?: number
  minute?: number
  second?: number
}

const datePattern = /^(\d{4})-(\d{2})-(\d{2})$/
const timePattern = /^(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?$/

function partsOf(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }
  const [datePart, timePart] = value.includes("T")
    ? value.split("T")
    : timePattern.test(value)
      ? ["", value]
      : [value, ""]
  const parts: Parts = {}
  if (datePart) {
    const match = datePattern.exec(datePart)
    if (!match) {
      return undefined
    }
    const [year, month, day] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3]),
    ]
    if (!isoDate(year, month, day)) {
      return undefined
    }
    parts.date = { year, month, day }
  }
  if (timePart) {
    const match = timePattern.exec(timePart)
    if (!match) {
      return undefined
    }
    const [hour, minute, second] = [
      Number(match[1]),
      Number(match[2]),
      Number(match[3] ?? 0),
    ]
    if (hour > 23 || minute > 59 || second > 59) {
      return undefined
    }
    Object.assign(parts, { hour, minute, second })
  }
  return parts.date || parts.hour !== undefined ? parts : undefined
}

/** The fields an ISO value fills, for the segments an input shows. */
function fieldsOf(value: string | null, format: Omit<Format, "locale">) {
  const fields = emptyFields()
  const parts = partsOf(value)
  if (!parts) {
    return fields
  }
  const types = typesOf(format)
  if (format.kind === "date") {
    if (!parts.date) {
      return fields
    }
    Object.assign(fields, parts.date)
  }
  if (types.includes("hour")) {
    if (parts.hour === undefined) {
      if (format.kind === "time") {
        return fields
      }
      Object.assign(parts, { hour: 0, minute: 0, second: 0 })
    }
    const hour = parts.hour!
    fields.hour = format.hourCycle === 12 ? hour % 12 || 12 : hour
    if (format.hourCycle === 12) {
      fields.dayPeriod = hour >= 12 ? 1 : 0
    }
    if (types.includes("minute")) {
      fields.minute = parts.minute!
    }
    if (types.includes("second")) {
      fields.second = parts.second!
    }
  }
  return fields
}

/**
 * A value in the input's own shape: a date and a time cut to its smallest
 * unit, or `null` when it isn't one it can show.
 */
function normalizeValue(value: unknown, format: Omit<Format, "locale">) {
  return valueOf(
    fieldsOf(typeof value === "string" ? value : null, format),
    format
  )
}

// Sorts as text: `YYYY-MM-DDTHH:mm:ss`, or `HH:mm:ss` for a time.
function sortKey(parts: Parts) {
  const time =
    parts.hour === undefined
      ? ""
      : `${pad(parts.hour, 2)}:${pad(parts.minute!, 2)}:${pad(parts.second!, 2)}`
  if (!parts.date) {
    return time
  }
  const { year, month, day } = parts.date
  return `${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}${time ? `T${time}` : ""}`
}

/**
 * How a value compares with a bound: -1 before it, 1 after it, 0 on it. A
 * bound with a date alone compares dates, so `max: "2026-12-31"` takes any
 * time that day.
 */
function compareTo(value: string, bound: string) {
  const a = partsOf(value)
  const b = partsOf(bound)
  if (!a || !b) {
    return 0
  }
  let left = sortKey(a)
  let right = sortKey(b)
  if (a.date && b.date && (b.hour === undefined || a.hour === undefined)) {
    left = left.slice(0, 10)
    right = right.slice(0, 10)
  }
  return left < right ? -1 : left > right ? 1 : 0
}

/** The date part of a value, for matching unavailable dates. */
const dateOf = (value: string) =>
  datePattern.test(value.slice(0, 10)) ? value.slice(0, 10) : undefined

export {
  boundsOf,
  clampDay,
  compareTo,
  dateOf,
  type DateInputGranularity,
  type DateInputSegmentData,
  type DateInputSegmentType,
  dayPeriodsOf,
  type EditableType,
  emptyFields,
  type Fields,
  fieldsOf,
  type Format,
  hourCycleOf,
  type HourCycle,
  type Kind,
  layoutOf,
  normalizeValue,
  pageStepOf,
  segmentsOf,
  stepField,
  stepToEnd,
  typeDigit,
  typePeriod,
  typesOf,
  valueOf,
}

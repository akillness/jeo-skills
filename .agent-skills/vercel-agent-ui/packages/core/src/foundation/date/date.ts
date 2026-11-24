// `@ui-sdk/core/date`: calendar dates without a date library. Dates are ISO
// strings (`YYYY-MM-DD`) with whole-day arithmetic, and every name, order and
// first day of the week comes from the browser's `Intl`. Calendar and Date
// Picker are built on it, and so can any date component of your own.
export {
  addDays,
  addMonths,
  addYears,
  clampDate,
  dateParts,
  daysBetween,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  isISODate,
  isSameMonth,
  isoDate,
  monthGrid,
  startOfMonth,
  startOfWeek,
  toISODate,
  weekday,
  type DateParts,
  type ISODate,
} from "./plain-date"
export { firstDayOfWeek } from "./week"
export {
  dateFormatter,
  formatDate,
  formatDateRange,
  formatDateToParts,
  monthNames,
  todayDate,
  weekdayNames,
} from "./format"
export {
  datePattern,
  parseDate,
  type DateField,
  type DatePattern,
} from "./parse"

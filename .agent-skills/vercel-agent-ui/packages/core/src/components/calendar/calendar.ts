// A calendar: months of days in a grid, one tab stop, and arrow keys that
// move by day and week across months, as the WAI-ARIA date picker dialog
// asks. It selects one date, any number, or a range, as ISO strings, with no
// date library: `@ui-sdk/core/date` does the arithmetic and `Intl` the names.
import { watchFormDisabled } from "../../foundation/forms/form"
import type {
  CalendarMode,
  CalendarValue,
  DateMatchers,
  ISOMonth,
} from "./calendar-model"
import type { ISODate } from "../../foundation/date/plain-date"
import { createController } from "../../foundation/kernel/controller"
import type {
  ChangeDetails,
  ChangeOptions,
} from "../../foundation/kernel/details"
import { definePrimitive } from "../../foundation/kernel/primitive"
import type {
  Named,
  PrimitiveContext,
  PrimitiveOptions,
} from "../../foundation/kernel/primitive-types"
import {
  calendarApi,
  calendarSlots,
  calendarState,
  calendarSync,
  isDisabled,
  type CalendarModelState,
} from "./calendar-api"

/**
 * Why a calendar's value wants to change.
 * @stable
 */
type CalendarValueChangeReason = "item-press" | "imperative"

/**
 * Why a calendar's visible month wants to change.
 * @stable
 */
type CalendarMonthChangeReason =
  | "previous-press"
  | "next-press"
  | "list-navigation"
  | "item-press"
  | "select-change"
  | "imperative"

/**
 * Why focus wants to move to another day.
 * @stable
 */
type CalendarFocusedChangeReason =
  "list-navigation" | "item-press" | "focus-in" | "imperative"

/**
 * Why a range's start wants to change.
 * @stable
 */
type CalendarAnchorChangeReason = "item-press" | "escape-key"

/**
 * Options for every write method on a controller.
 * @stable
 */
type CalendarChangeOptions<Reason extends string = string> =
  ChangeOptions<Reason>

/**
 * Drives a calendar from anywhere. Pass it as the `controller` option.
 * @stable
 */
function createCalendarController() {
  return createController<{
    /** The selected value: an ISO date, a list of them, or a `[start, end]` range. */
    getValue: () => CalendarValue
    /** Selects a value. Returns false when canceled, unchanged, disabled, read-only, or holding a date people can't pick, like one past `max`. */
    setValue: (
      value: CalendarValue,
      options?: CalendarChangeOptions<CalendarValueChangeReason>
    ) => boolean
    /** The first month shown, like `"2026-10"`. */
    getMonth: () => ISOMonth
    /** Shows a month first. Returns false when canceled or unchanged. */
    setMonth: (
      month: ISOMonth,
      options?: CalendarChangeOptions<CalendarMonthChangeReason>
    ) => boolean
    /** Shows the months before, as the Previous part does. */
    previous: (
      options?: CalendarChangeOptions<CalendarMonthChangeReason>
    ) => boolean
    /** Shows the months after, as the Next part does. */
    next: (
      options?: CalendarChangeOptions<CalendarMonthChangeReason>
    ) => boolean
    /** Focuses a date, turning the months to show it, or the date with the tab stop. */
    focus: (date?: ISODate) => void
  }>()
}

/**
 * A controller from `createCalendarController()`. Pass it as the `controller` option.
 * @stable
 */
type CalendarController = ReturnType<typeof createCalendarController>

/**
 * The options `calendar` takes. A component takes them as props on its root.
 * @stable
 */
type CalendarOptions = {
  /**
   * How many dates it selects: one, any number, or a range from a start to an end.
   * @defaultValue "single"
   */
  mode?: CalendarMode
  /** The selected value: an ISO date for `"single"`, a list for `"multiple"`, `[start, end]` for `"range"`, or `null`. Pass it to control the calendar. */
  value?: CalendarValue
  /** The value it starts with, when uncontrolled. */
  defaultValue?: CalendarValue
  /**
   * Runs when a date is pressed (`"item-press"`), with Enter or Space too, or
   * a controller sets the value (`"imperative"`). A range changes once both
   * ends are picked. `details.cancel()` keeps the value.
   */
  onValueChange?: (
    value: CalendarValue,
    details: ChangeDetails<CalendarValueChangeReason>
  ) => void
  /** The first month shown, like `"2026-10"`. Pass it to control the calendar. */
  month?: ISOMonth
  /** The first month it shows, when uncontrolled. Defaults to the selected date's month, else today's. */
  defaultMonth?: ISOMonth
  /** Runs when the months shown want to change: Previous or Next, a key moving focus to another month, a press on a day of another month, or a controller. */
  onMonthChange?: (
    month: ISOMonth,
    details: ChangeDetails<CalendarMonthChangeReason>
  ) => void
  /** The earliest date that can be picked. Keys stop there, and Previous stops at its month. */
  min?: ISODate
  /** The latest date that can be picked. */
  max?: ISODate
  /**
   * Dates that can't be picked, like booked days, as data: ISO dates,
   * `{ from, to }`, `{ weekday: [0, 6] }` for weekends, `{ before }`,
   * `{ after }`, or a function. They stay focusable, so keyboard users hear
   * them.
   */
  unavailable?: DateMatchers
  /** Whether nothing can be picked or focused. */
  disabled?: boolean
  /** Whether dates can be focused but not picked. */
  readOnly?: boolean
  /**
   * Whether pressing the selected date again clears it, in `"single"` mode.
   * @defaultValue false
   */
  deselectable?: boolean
  /** Runs before keys, a press or `focus()` move focus to another day. Canceling keeps focus where it was. */
  onFocusedChange?: (
    date: ISODate,
    details: ChangeDetails<CalendarFocusedChangeReason>
  ) => void
  /** Runs before a press starts a range, or ends it or Escape drops it, with `null`. Canceling keeps the start as it was. */
  onAnchorChange?: (
    anchor: ISODate | null,
    details: ChangeDetails<CalendarAnchorChangeReason>
  ) => void
  /**
   * How many months show side by side, each in its own grid.
   * @defaultValue 1
   */
  months?: number
  /**
   * Whether Previous, Next and keys turn one month, or all the months shown.
   * @defaultValue "month"
   */
  pageBy?: "month" | "page"
  /** The language of the names and labels. Defaults to the page's `lang`, then the browser's. */
  locale?: string
  /** The first day of the week, 0 for Sunday. Defaults to the locale's. */
  weekStartsOn?: number
  /**
   * How weekday headers are written.
   * @defaultValue "short"
   */
  weekdayFormat?: "narrow" | "short" | "long"
  /**
   * How month names are written, in the heading and the month select.
   * @defaultValue "long"
   */
  monthFormat?: "narrow" | "short" | "long"
  /**
   * Whether every month shows six weeks, so the calendar doesn't change height.
   * @defaultValue false
   */
  fixedWeeks?: boolean
  /**
   * Whether the days of the months before and after show at the edges.
   * @defaultValue true
   */
  showOutsideDays?: boolean
  /** Today's date, for `aria-current` and the starting month. Defaults to today in `timeZone`, read on the client. */
  today?: ISODate
  /** The time zone that says what day today is, like `"America/New_York"`. Defaults to the browser's. */
  timeZone?: string
  /** The fewest days a range can span, counting both ends. */
  minDays?: number
  /** The most days a range can span, counting both ends. */
  maxDays?: number
  /** Whether a range may hold unavailable dates, like a stay over a booked night. */
  allowUnavailable?: boolean
  /** Drives it from anywhere. Create one with `createCalendarController()`. */
  controller?: CalendarController
} & PrimitiveOptions

/**
 * What `render` functions and state-based class names of the root receive.
 * @stable
 */
type CalendarState = {
  /** The selected value. */
  value: CalendarValue
  /** The first month shown. */
  month: ISOMonth
  /** How it selects. */
  mode: CalendarMode
  /** Whether nothing can be picked or focused. */
  disabled: boolean
  /** Whether dates can be focused but not picked. */
  readOnly: boolean
  /** The date with the tab stop, `null` until days render in the browser. */
  focused: ISODate | null
  /** A range's start while its end is being picked, else `null`. */
  anchor: ISODate | null
}

/**
 * What `render` functions and state-based class names of the heading receive.
 * @stable
 */
type CalendarHeadingState = {
  /** The first month shown, to format the heading yourself. */
  month: ISOMonth
  /** The months shown in `monthFormat`, like "October 2026", or "October – November 2026". */
  label: string
}

/**
 * A month or a year a select offers.
 * @stable
 */
type CalendarSelectOption = {
  /** The month, 1 to 12, or the year. */
  value: number
  /** Its name in the locale, like "October" or "2026". */
  label: string
  /** Whether it lies outside `min` and `max`. */
  disabled: boolean
}

/**
 * What `render` functions and state-based class names of the month and year
 * selects receive. The options can feed any select, like a styled one.
 * @stable
 */
type CalendarSelectState = {
  /** The first month shown's month, 1 to 12, or its year. */
  value: number
  /** Every month, or the years from `min` to `max` (10 either side of the year shown without them). */
  options: CalendarSelectOption[]
  /** Whether the calendar's `disabled` option is on. Inside a Date Picker, a disabled `<fieldset>` around the picker counts too. */
  disabled: boolean
}

/**
 * What `render` functions and state-based class names of Previous and Next receive.
 * @stable
 */
type CalendarStepState = {
  /** The first month it shows. */
  month: ISOMonth
  /** Whether it can't go further, past `min` or `max`. */
  disabled: boolean
}

/**
 * A cell of a grid's week, as the grid's state lists it.
 * @stable
 */
type CalendarGridCell = {
  /** Its ISO date, like `"2026-10-27"`. Pass it as the day's `value`. */
  date: ISODate
  /** Whether it belongs to the month before or after. */
  outside: boolean
  /** Whether it shows nothing: an outside day that's hidden, or one another grid shows. Render an empty cell. */
  hidden: boolean
}

/**
 * What `render` functions and state-based class names of a grid receive.
 * @stable
 */
type CalendarGridState = {
  /** The month it shows: the first month shown, plus its `offset`. */
  month: ISOMonth
  /** The month's name and year in `monthFormat`, like "October 2026". */
  label: string
  /** The weekday of each column, 0 for Sunday, in the order they show. */
  weekdays: number[]
  /** The weeks, each seven cells. Render a day for each cell that isn't hidden. */
  weeks: CalendarGridCell[][]
}

/**
 * What `render` functions and state-based class names of a weekday header receive.
 * @stable
 */
type CalendarWeekdayState = {
  /** The weekday, 0 for Sunday. */
  weekday: number
  /** Its name, in `weekdayFormat`. */
  label: string
  /** Its full name, which screen readers hear. */
  name: string
}

/**
 * What `render` functions and state-based class names of a day receive.
 * @stable
 */
type CalendarDayState = {
  /** Its ISO date. */
  date: ISODate
  /** The day of the month in the locale's digits, like "16". */
  label: string
  /** Whether it's selected. In a range, every date from start to end is. */
  selected: boolean
  /** Whether it's the `today` option's date, or else today in `timeZone`, read once the calendar runs in the browser. */
  today: boolean
  /** Whether it belongs to the month before or after its grid's. */
  outside: boolean
  /** Whether it can't be picked: outside `min` and `max`, unavailable, unable to end the range being picked, or the calendar is disabled. */
  disabled: boolean
  /** Whether `unavailable` names it. */
  unavailable: boolean
  /** Whether a range starts here, including one being picked. */
  rangeStart: boolean
  /** Whether a range ends here, including one being picked. */
  rangeEnd: boolean
  /** Whether it's inside a range, ends included, including one being picked. */
  inRange: boolean
}

/**
 * The props the `grid` slot takes.
 * @stable
 */
type CalendarGridProps = {
  /**
   * Which of the months shown it is, from 0.
   * @defaultValue 0
   */
  offset?: number
}

/**
 * The props the `weekday` slot takes.
 * @stable
 */
type CalendarWeekdayProps = {
  /** The column, from 0. */
  index: number
}

/**
 * The props the `day` slot takes.
 * @stable
 */
type CalendarDayProps = {
  /** Its ISO date. */
  value: ISODate
  /**
   * The offset of the grid it's in, read from that grid, so you don't pass it.
   * @defaultValue 0
   */
  offset?: number
}

/**
 * `calendar`'s api, which its slots and controller call. Adapters expose it as `api`.
 * @stable
 */
interface CalendarApi extends ReturnType<
  typeof calendarApi<CalendarOptions, CalendarModelState>
> {}

const calendarPrimitiveApi: (
  context: PrimitiveContext<CalendarOptions, CalendarModelState, string>
) => CalendarApi = (context) => calendarApi(context)

const calendarPrimitive = /* @__PURE__ */ definePrimitive({
  name: "calendar",
  options: {
    mode: "string",
    value: "list",
    defaultValue: "list",
    onValueChange: "callback",
    onMonthChange: "callback",
    month: "string",
    defaultMonth: "string",
    min: "string",
    max: "string",
    unavailable: "list",
    disabled: "boolean",
    readOnly: "boolean",
    deselectable: "boolean",
    onFocusedChange: "callback",
    onAnchorChange: "callback",
    months: "number",
    pageBy: "string",
    locale: "string",
    weekStartsOn: "number",
    weekdayFormat: "string",
    monthFormat: "string",
    fixedWeeks: "boolean",
    showOutsideDays: "boolean",
    today: "string",
    timeZone: "string",
    minDays: "number",
    maxDays: "number",
    allowUnavailable: "boolean",
    controller: "value",
  },
  state: calendarState,
  controlled: ["value", "month"],
  sync: calendarSync,
  api: calendarPrimitiveApi,
  slots: (slot) => ({
    root: slot<{}, CalendarState>({
      state: (state) => ({
        value: state.value,
        month: state.month,
        mode: state.mode,
        disabled: isDisabled(state),
        readOnly: state.readOnly,
        focused: state.focused,
        anchor: state.anchor,
      }),
      attrs: (state) => ({
        "data-mode": state.mode,
        "data-disabled": isDisabled(state) ? "" : undefined,
        "data-readonly": state.readOnly ? "" : undefined,
      }),
      bind(el, { api, store }) {
        const cleanups = [
          watchFormDisabled(el, store),
          api.internal.bindRoot(el),
        ]
        return () => cleanups.forEach((cleanup) => cleanup?.())
      },
    }),

    ...calendarSlots(slot),
  }),
  agent: { actions: ["setValue", "setMonth", "previous", "next"] },
})

/**
 * The type of `calendar`.
 * @stable
 */
interface CalendarPrimitive extends Named<typeof calendarPrimitive> {}

/**
 * The calendar primitive, with the slots `root`, `heading`, `previous`,
 * `next`, `grid`, `weekdays`, `weekday`, `week` and `day`.
 * Render it with an adapter's `usePrimitive`, or compose it inside your own
 * primitive.
 * @stable
 */
const calendar: CalendarPrimitive = calendarPrimitive

export {
  calendar,
  type CalendarAnchorChangeReason,
  type CalendarApi,
  type CalendarChangeOptions,
  type CalendarController,
  type CalendarDayProps,
  type CalendarDayState,
  type CalendarFocusedChangeReason,
  type CalendarGridCell,
  type CalendarGridProps,
  type CalendarGridState,
  type CalendarHeadingState,
  type CalendarMonthChangeReason,
  type CalendarOptions,
  type CalendarPrimitive,
  type CalendarSelectOption,
  type CalendarSelectState,
  type CalendarState,
  type CalendarStepState,
  type CalendarValueChangeReason,
  type CalendarWeekdayProps,
  type CalendarWeekdayState,
  createCalendarController,
}
export type {
  CalendarMode,
  CalendarValue,
  DateMatcher,
  DateMatchers,
  ISOMonth,
} from "./calendar-model"

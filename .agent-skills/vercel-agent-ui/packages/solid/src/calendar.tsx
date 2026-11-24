import {
  calendar as calendarPrimitive,
  type CalendarDayState,
  type CalendarGridCell,
  type CalendarGridState,
  type CalendarHeadingState,
  type CalendarOptions,
  type CalendarSelectState,
  type CalendarState,
  type CalendarStepState,
  type CalendarWeekdayState,
} from "@ui-sdk/core/calendar"
import type { JSX } from "@solidjs/web"
import {
  createContext,
  For,
  merge,
  omit,
  Repeat,
  Show,
  useContext,
} from "solid-js"
import { CalendarContext, monthCount } from "./calendar-context"
import {
  rootScope,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

// A grid's offset and state, for the rows and days inside it.
type GridContextValue = { readonly offset: number; state: CalendarGridState }

const GridContext = createContext<GridContextValue | null>(null)

function useCalendar(part: string) {
  const context = useContext(CalendarContext)
  if (!context) {
    throw new Error(
      `${part} must be used inside <Calendar> or <DatePickerContent>.`
    )
  }
  return context
}

function useGrid(part: string) {
  const context = useContext(GridContext)
  if (!context) {
    throw new Error(`${part} must be used inside <CalendarGrid>.`)
  }
  return context
}

// The part's props with `children` defaulting to `fallback` when it has none:
// content, or a function of the part's state that returns it.
function withFallback<State>(
  props: Record<string, any>,
  fallback: (state: State) => JSX.Element
) {
  return merge(props, {
    get children() {
      return props.children ?? fallback
    },
  })
}

// Children that take the part's state are called with it, as `usePart` does.
const ofState = (children: unknown, state: unknown) =>
  typeof children === "function" && children.length > 0
    ? children(state)
    : children

/**
 * Months of days with one tab stop. Without children it renders a heading,
 * Previous and Next, and a grid for each month.
 * @stable
 */
const Calendar = /* @__PURE__ */ rootScope(function Calendar(
  props: CalendarOptions & PartProps<"div", CalendarState>
) {
  const calendar = usePrimitive(calendarPrimitive, () => ({
    mode: props.mode,
    value: props.value,
    defaultValue: props.defaultValue,
    onValueChange: props.onValueChange,
    month: props.month,
    defaultMonth: props.defaultMonth,
    onMonthChange: props.onMonthChange,
    min: props.min,
    max: props.max,
    unavailable: props.unavailable,
    disabled: props.disabled,
    readOnly: props.readOnly,
    deselectable: props.deselectable,
    onFocusedChange: props.onFocusedChange,
    onAnchorChange: props.onAnchorChange,
    months: props.months,
    pageBy: props.pageBy,
    locale: props.locale,
    weekStartsOn: props.weekStartsOn,
    weekdayFormat: props.weekdayFormat,
    monthFormat: props.monthFormat,
    fixedWeeks: props.fixedWeeks,
    showOutsideDays: props.showOutsideDays,
    today: props.today,
    timeZone: props.timeZone,
    minDays: props.minDays,
    maxDays: props.maxDays,
    allowUnavailable: props.allowUnavailable,
    controller: props.controller,
    debug: props.debug,
  }))
  const rest = omit(
    props,
    "mode",
    "value",
    "defaultValue",
    "onValueChange",
    "month",
    "defaultMonth",
    "onMonthChange",
    "min",
    "max",
    "unavailable",
    "disabled",
    "readOnly",
    "deselectable",
    "onFocusedChange",
    "onAnchorChange",
    "months",
    "pageBy",
    "locale",
    "weekStartsOn",
    "weekdayFormat",
    "monthFormat",
    "fixedWeeks",
    "showOutsideDays",
    "today",
    "timeZone",
    "minDays",
    "maxDays",
    "allowUnavailable",
    "controller",
    "debug"
  )
  const fallback = () => (
    <>
      <div>
        <CalendarPrevious />
        <CalendarHeading />
        <CalendarNext />
      </div>
      <Repeat count={monthCount(props.months)}>
        {(offset) => <CalendarGrid offset={offset} />}
      </Repeat>
    </>
  )
  return (
    <CalendarContext value={calendar}>
      {usePart(
        calendar,
        "root",
        undefined,
        withFallback(rest, fallback),
        "div"
      )}
    </CalendarContext>
  )
})

/**
 * The months shown, like "October 2026". Screen readers hear it change.
 * @stable
 */
function CalendarHeading(props: PartProps<"h2", CalendarHeadingState>) {
  const calendar = useCalendar("CalendarHeading")
  const label = (state: CalendarHeadingState) => state.label
  return usePart(
    calendar,
    "heading",
    undefined,
    withFallback(props, label),
    "h2"
  )
}

type SelectProps = Omit<PartProps<"select", CalendarSelectState>, "value">

function selectPart(
  name: "month-select" | "year-select",
  part: string,
  props: SelectProps
) {
  const calendar = useCalendar(part)
  const options = (state: CalendarSelectState) => (
    <For each={state.options} keyed={(option) => option.value}>
      {(option) => (
        // Selected on the server too; the core writes the select's value once it binds.
        <option
          value={String(option().value)}
          disabled={option().disabled}
          selected={option().value === state.value}
        >
          {option().label}
        </option>
      )}
    </For>
  )
  return usePart(
    calendar,
    name,
    undefined,
    withFallback(props, options),
    "select"
  )
}

/**
 * A native select of the months, in the locale, that turns the first month shown.
 * @stable
 */
function CalendarMonthSelect(props: SelectProps) {
  return selectPart("month-select", "CalendarMonthSelect", props)
}

/**
 * A native select of the years from `min` to `max`, or 10 either side of the year shown.
 * @stable
 */
function CalendarYearSelect(props: SelectProps) {
  return selectPart("year-select", "CalendarYearSelect", props)
}

type StepProps = PartProps<"button", CalendarStepState>

function stepPart(name: "previous" | "next", part: string, props: StepProps) {
  const calendar = useCalendar(part)
  const glyph = name === "previous" ? "‹" : "›"
  return usePart(
    calendar,
    name,
    undefined,
    withFallback(props, () => glyph),
    "button"
  )
}

/**
 * Shows the month before. Named "Previous month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarPrevious(props: StepProps) {
  return stepPart("previous", "CalendarPrevious", props)
}

/**
 * Shows the month after. Named "Next month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarNext(props: StepProps) {
  return stepPart("next", "CalendarNext", props)
}

/**
 * One month's grid, a table. `offset` picks which of the months shown, from 0.
 * Without children it renders its weekdays and weeks.
 * @stable
 */
function CalendarGrid(
  props: PartProps<"table", CalendarGridState> & { offset?: number }
) {
  const calendar = useCalendar("CalendarGrid")
  const part = () => ({
    offset: props.offset ?? 0,
    id: String(props.offset ?? 0),
  })
  const rest = omit(props, "offset")
  // The grid's state reaches its rows and days through context, so the
  // children render inside it, as a function of the state.
  const content = (state: CalendarGridState) => {
    const grid: GridContextValue = {
      get offset() {
        return props.offset ?? 0
      },
      state,
    }
    // Read inside the provider: reading a JSX children getter makes its parts.
    return (
      <GridContext value={grid}>
        {ofState(props.children, state) ?? fallback()}
      </GridContext>
    )
  }
  const fallback = () => (
    <>
      <CalendarWeekdays />
      <CalendarWeeks />
    </>
  )
  return usePart(
    calendar,
    "grid",
    part,
    merge(rest, { children: content }),
    "table"
  )
}

/**
 * The header row of weekday names, a weekday in each column. Its children can
 * be a function of the column's index that renders it, like
 * `(index) => <CalendarWeekday index={index} class="…" />`.
 * @stable
 */
function CalendarWeekdays(
  props: Omit<JSX.IntrinsicElements["thead"], "children"> & {
    children?: (index: number) => JSX.Element
  }
) {
  const calendar = useCalendar("CalendarWeekdays")
  const grid = useGrid("CalendarWeekdays")
  const rest = omit(props, "children")
  const row = calendar.slot("weekdays", () => ({ id: String(grid.offset) }))
  // By column: a column's header stays when the week starts on another day.
  return (
    <thead {...rest}>
      <tr {...row}>
        <For each={grid.state.weekdays} keyed={false}>
          {(_, index) =>
            props.children ? (
              props.children(index)
            ) : (
              <CalendarWeekday index={index} />
            )
          }
        </For>
      </tr>
    </thead>
  )
}

/**
 * A weekday's column header. Shows its name in `weekdayFormat` unless it has children.
 * @stable
 */
function CalendarWeekday(
  props: PartProps<"th", CalendarWeekdayState> & { index: number }
) {
  const calendar = useCalendar("CalendarWeekday")
  const grid = useGrid("CalendarWeekday")
  const part = () => ({
    index: props.index,
    id: `${grid.offset}-${props.index}`,
  })
  const rest = merge({ scope: "col" }, omit(props, "index"))
  const label = (state: CalendarWeekdayState) => state.label
  return usePart(calendar, "weekday", part, withFallback(rest, label), "th")
}

/**
 * The weeks of the grid's month, a row each, with a day in each cell. Its
 * children can be a function of a cell that renders its day, like
 * `(cell) => <CalendarDay value={cell.date} class="…" />`. A cell that shows
 * nothing stays an empty cell.
 * @stable
 */
function CalendarWeeks(
  props: Omit<JSX.IntrinsicElements["tbody"], "children"> & {
    children?: (cell: CalendarGridCell) => JSX.Element
  }
) {
  const calendar = useCalendar("CalendarWeeks")
  const grid = useGrid("CalendarWeeks")
  const rest = omit(props, "children")
  const day = (cell: CalendarGridCell) =>
    props.children ? props.children(cell) : <CalendarDay value={cell.date} />
  // Keyed by date, so a week and a day that show in the next month too stay.
  return (
    <tbody {...rest}>
      <For each={grid.state.weeks} keyed={(week) => week[0]!.date}>
        {(week, index) => {
          // Before the row's element, as on the server, so hydration keys line up.
          const row = calendar.slot("week", () => ({
            id: `${grid.offset}-${index()}`,
          }))
          return (
            <tr {...row}>
              <For each={week()} keyed={(cell) => cell.date}>
                {(cell) => (
                  <Show when={!cell().hidden} fallback={<td />}>
                    {day(cell())}
                  </Show>
                )}
              </For>
            </tr>
          )
        }}
      </For>
    </tbody>
  )
}

/**
 * A day. Shows the day of the month unless it has children; arrow keys move between days.
 * @stable
 */
function CalendarDay(
  props: PartProps<"td", CalendarDayState> & { value: string }
) {
  const calendar = useCalendar("CalendarDay")
  const grid = useContext(GridContext)
  const part = () => ({ value: props.value, offset: grid?.offset ?? 0 })
  const rest = omit(props, "value")
  const label = (state: CalendarDayState) => state.label
  return usePart(calendar, "day", part, withFallback(rest, label), "td")
}

export { createCalendarController } from "@ui-sdk/core/calendar"
export type {
  CalendarAnchorChangeReason,
  CalendarApi,
  CalendarChangeOptions,
  CalendarController,
  CalendarDayProps,
  CalendarDayState,
  CalendarFocusedChangeReason,
  CalendarGridCell,
  CalendarGridProps,
  CalendarGridState,
  CalendarHeadingState,
  CalendarMode,
  CalendarMonthChangeReason,
  CalendarOptions,
  CalendarPrimitive,
  CalendarSelectOption,
  CalendarSelectState,
  CalendarState,
  CalendarStepState,
  CalendarValue,
  CalendarValueChangeReason,
  CalendarWeekdayProps,
  CalendarWeekdayState,
  DateMatcher,
  DateMatchers,
  ISOMonth,
} from "@ui-sdk/core/calendar"

export {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
}

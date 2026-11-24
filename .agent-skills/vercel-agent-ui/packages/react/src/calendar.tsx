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
import * as React from "react"
import { CalendarContext, GridContext } from "./calendar-context"
import {
  renderElement,
  slotIn,
  usePart,
  usePrimitive,
  type PartProps,
} from "./use-primitive"

function useCalendar(part: string) {
  const context = React.useContext(CalendarContext)
  if (!context) {
    throw new Error(
      `${part} must be used inside <Calendar> or <DatePickerContent>.`
    )
  }
  return context
}

function useGrid(part: string) {
  const context = React.useContext(GridContext)
  if (!context) {
    throw new Error(`${part} must be used inside <CalendarGrid>.`)
  }
  return context
}

/**
 * Months of days with one tab stop. Without children it renders a heading,
 * Previous and Next, and a grid for each month.
 * @stable
 */
function Calendar({
  mode,
  value,
  defaultValue,
  onValueChange,
  month,
  defaultMonth,
  onMonthChange,
  min,
  max,
  unavailable,
  disabled,
  readOnly,
  deselectable,
  onFocusedChange,
  onAnchorChange,
  months,
  pageBy,
  locale,
  weekStartsOn,
  weekdayFormat,
  monthFormat,
  fixedWeeks,
  showOutsideDays,
  today,
  timeZone,
  minDays,
  maxDays,
  allowUnavailable,
  controller,
  debug,
  children,
  ...props
}: CalendarOptions & Omit<PartProps<"div", CalendarState>, "defaultValue">) {
  const calendar = usePrimitive(calendarPrimitive, {
    mode,
    value,
    defaultValue,
    onValueChange,
    month,
    defaultMonth,
    onMonthChange,
    min,
    max,
    unavailable,
    disabled,
    readOnly,
    deselectable,
    onFocusedChange,
    onAnchorChange,
    months,
    pageBy,
    locale,
    weekStartsOn,
    weekdayFormat,
    monthFormat,
    fixedWeeks,
    showOutsideDays,
    today,
    timeZone,
    minDays,
    maxDays,
    allowUnavailable,
    controller,
    debug,
  })
  const content =
    children === undefined ? (
      <>
        <div>
          <CalendarPrevious />
          <CalendarHeading />
          <CalendarNext />
        </div>
        {Array.from(
          { length: Math.max(1, Math.floor(months ?? 1) || 1) },
          (_, offset) => (
            <CalendarGrid key={offset} offset={offset} />
          )
        )}
      </>
    ) : (
      children
    )
  return (
    // In a context of its own, since a Date Picker renders the same parts over its own primitive.
    <CalendarContext.Provider value={calendar}>
      {usePart(calendar, "root", {}, { ...props, children: content })}
    </CalendarContext.Provider>
  )
}

/**
 * The months shown, like "October 2026". Screen readers hear it change.
 * @stable
 */
function CalendarHeading({
  children = label,
  ...props
}: PartProps<"h2", CalendarHeadingState>) {
  return usePart(
    useCalendar("CalendarHeading"),
    "heading",
    {},
    { ...props, children },
    "h2"
  )
}

const label = (state: { label: string }) => state.label

type SelectProps = Omit<
  PartProps<"select", CalendarSelectState>,
  "value" | "defaultValue"
>

function useSelect(
  name: "month-select" | "year-select",
  part: string,
  { render, children = options, ...props }: SelectProps
) {
  // The core writes the selected option as it changes, so React only renders where it starts.
  const select = (
    { value, ...attrs }: Record<string, any>,
    state: CalendarSelectState
  ) => renderElement("select", { ...attrs, defaultValue: value }, render, state)
  return usePart(
    useCalendar(part),
    name,
    {},
    { ...props, children, render: select },
    "select"
  )
}

const options = (state: CalendarSelectState) =>
  state.options.map((option) => (
    <option key={option.value} value={option.value} disabled={option.disabled}>
      {option.label}
    </option>
  ))

/**
 * A native select of the months, in the locale, that turns the first month shown.
 * @stable
 */
function CalendarMonthSelect(props: SelectProps) {
  return useSelect("month-select", "CalendarMonthSelect", props)
}

/**
 * A native select of the years from `min` to `max`, or 10 either side of the year shown.
 * @stable
 */
function CalendarYearSelect(props: SelectProps) {
  return useSelect("year-select", "CalendarYearSelect", props)
}

type StepProps = PartProps<"button", CalendarStepState>

function useStep(
  name: "previous" | "next",
  part: string,
  { children, ...props }: StepProps
) {
  const content = children ?? (name === "previous" ? "‹" : "›")
  return usePart(
    useCalendar(part),
    name,
    {},
    { ...props, children: content },
    "button"
  )
}

/**
 * Shows the month before. Named "Previous month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarPrevious(props: StepProps) {
  return useStep("previous", "CalendarPrevious", props)
}

/**
 * Shows the month after. Named "Next month"; pass `aria-label` in another language.
 * @stable
 */
function CalendarNext(props: StepProps) {
  return useStep("next", "CalendarNext", props)
}

/**
 * One month's grid, a table. `offset` picks which of the months shown, from 0.
 * Without children it renders its weekdays and weeks.
 * @stable
 */
function CalendarGrid({
  offset = 0,
  children = defaultGrid,
  ...props
}: PartProps<"table", CalendarGridState> & { offset?: number }) {
  // Grids are told apart by their offset. The parts inside read the grid's state.
  const content = (state: CalendarGridState) => (
    <GridScope offset={offset} state={state}>
      {typeof children === "function" ? children(state) : children}
    </GridScope>
  )
  return usePart(
    useCalendar("CalendarGrid"),
    "grid",
    { offset, id: String(offset) },
    { ...props, children: content },
    "table"
  )
}

const defaultGrid = (
  <>
    <CalendarWeekdays />
    <CalendarWeeks />
  </>
)

function GridScope({
  offset,
  state,
  children,
}: {
  offset: number
  state: CalendarGridState
  children: React.ReactNode
}) {
  const grid = React.useMemo(
    () => ({ offset, state }),
    [offset, state.month, state.weeks]
  )
  return <GridContext.Provider value={grid}>{children}</GridContext.Provider>
}

/**
 * The header row of weekday names, a weekday in each column. Its children can
 * be a function of the column's index that renders it, like
 * `(index) => <CalendarWeekday index={index} className="…" />`.
 * @stable
 */
function CalendarWeekdays({
  children,
  ...props
}: Omit<React.ComponentProps<"thead">, "children"> & {
  children?: (index: number) => React.ReactNode
}) {
  const calendar = useCalendar("CalendarWeekdays")
  const { offset, state } = useGrid("CalendarWeekdays")
  return (
    <thead {...props}>
      <tr {...slotIn(calendar, "weekdays", { id: String(offset) })}>
        {state.weekdays.map((weekday, index) => (
          <React.Fragment key={weekday}>
            {children ? children(index) : <CalendarWeekday index={index} />}
          </React.Fragment>
        ))}
      </tr>
    </thead>
  )
}

/**
 * A weekday's column header. Shows its name in `weekdayFormat` unless it has children.
 * @stable
 */
function CalendarWeekday({
  index,
  children = label,
  ...props
}: PartProps<"th", CalendarWeekdayState> & { index: number }) {
  const { offset } = useGrid("CalendarWeekday")
  const part = { index, id: `${offset}-${index}` }
  return usePart(
    useCalendar("CalendarWeekday"),
    "weekday",
    part,
    { scope: "col", ...props, children },
    "th"
  )
}

/**
 * The weeks of the grid's month, a row each, with a day in each cell. Its
 * children can be a function of a cell that renders its day, like
 * `(cell) => <CalendarDay value={cell.date} className="…" />`. A cell that
 * shows nothing stays an empty cell.
 * @stable
 */
function CalendarWeeks({
  children,
  ...props
}: Omit<React.ComponentProps<"tbody">, "children"> & {
  children?: (cell: CalendarGridCell) => React.ReactNode
}) {
  const calendar = useCalendar("CalendarWeeks")
  const { offset, state } = useGrid("CalendarWeeks")
  return (
    <tbody {...props}>
      {state.weeks.map((week, index) => (
        <tr
          key={week[0]!.date}
          {...slotIn(calendar, "week", { id: `${offset}-${index}` })}
        >
          {week.map((cell) =>
            cell.hidden ? (
              <td key={cell.date} />
            ) : (
              <React.Fragment key={cell.date}>
                {children ? children(cell) : <CalendarDay value={cell.date} />}
              </React.Fragment>
            )
          )}
        </tr>
      ))}
    </tbody>
  )
}

/**
 * A day. Shows the day of the month unless it has children; arrow keys move between days.
 * @stable
 */
function CalendarDay({
  value,
  children = label,
  ...props
}: PartProps<"td", CalendarDayState> & { value: string }) {
  const grid = React.useContext(GridContext)
  const part = { value, offset: grid?.offset ?? 0 }
  return usePart(
    useCalendar("CalendarDay"),
    "day",
    part,
    { ...props, children },
    "td"
  )
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

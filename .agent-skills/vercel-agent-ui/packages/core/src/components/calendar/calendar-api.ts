// What Calendar and Date Picker share: a calendar's state, its behavior and
// every part but the root. The public entries are calendar.ts and date-picker.ts.
import {
  addMonthsTo,
  gridWeeks,
  isAllowedRange,
  isISOMonth,
  matchesDate,
  monthOf,
  monthToShow,
  moveDate,
  normalizeValue,
  pressRange,
  rangeTo,
  selectedDates,
  visibleRange,
  type CalendarMode,
  type CalendarValue,
  type DateMatchers,
  type ISOMonth,
} from "./calendar-model"
import {
  addDays,
  clampDate,
  isISODate,
  type ISODate,
} from "../../foundation/date/plain-date"
import { firstDayOfWeek } from "../../foundation/date/week"
import {
  dateFormatter,
  formatDate,
  formatDateRange,
  monthNames,
  todayDate,
  weekdayNames,
} from "../../foundation/date/format"
import { createRovingFocus } from "../../foundation/focus/roving-focus"
import { createFocusRecovery } from "../../foundation/focus/focus-recovery"
import { isDisabled } from "../../foundation/forms/form"
import { bindPageLocale, localeOf } from "../../foundation/text/locale"
import type {
  PrimitiveContext,
  SlotFactory,
} from "../../foundation/kernel/primitive-types"
import { createChange, dispatch } from "../../foundation/kernel/input-source"
import { selects } from "../../foundation/kernel/selects"
import type {
  CalendarAnchorChangeReason,
  CalendarChangeOptions,
  CalendarDayProps,
  CalendarDayState,
  CalendarFocusedChangeReason,
  CalendarGridProps,
  CalendarGridState,
  CalendarHeadingState,
  CalendarMonthChangeReason,
  CalendarOptions,
  CalendarSelectState,
  CalendarStepState,
  CalendarValueChangeReason,
  CalendarWeekdayProps,
  CalendarWeekdayState,
} from "./calendar"

// A calendar's state, which Date Picker extends.
type CalendarModelState = {
  mode: CalendarMode
  value: CalendarValue
  month: ISOMonth
  // The date with the tab stop, null until days bind.
  focused: ISODate | null
  // A range's start while its end is being picked, and the date the end would be.
  anchor: ISODate | null
  hover: ISODate | null
  today: ISODate | null
  pageLocale: string | null
  min: ISODate | null
  max: ISODate | null
  unavailable: DateMatchers | null
  disabled: boolean
  readOnly: boolean
  deselectable: boolean
  months: number
  pageBy: "month" | "page"
  locale: string | null
  weekStartsOn: number | null
  weekdayFormat: "narrow" | "short" | "long"
  monthFormat: "narrow" | "short" | "long"
  fixedWeeks: boolean
  showOutsideDays: boolean
  minDays: number | undefined
  maxDays: number | undefined
  allowUnavailable: boolean
  // Whether an ancestor fieldset disables it, for a component that sits in a form.
  formDisabled: boolean
}

type State = CalendarModelState

const dateOrNull = (value: unknown) => (isISODate(value) ? value : null)

const calendarSettings = (options: CalendarOptions) => ({
  mode: options.mode ?? "single",
  min: dateOrNull(options.min),
  max: dateOrNull(options.max),
  unavailable: options.unavailable ?? null,
  disabled: !!options.disabled,
  readOnly: !!options.readOnly,
  deselectable: !!options.deselectable,
  months: Number.isFinite(options.months)
    ? Math.max(1, Math.floor(options.months!))
    : 1,
  pageBy: options.pageBy ?? "month",
  locale: options.locale ?? null,
  weekStartsOn:
    options.weekStartsOn === undefined
      ? null
      : ((options.weekStartsOn % 7) + 7) % 7,
  weekdayFormat: options.weekdayFormat ?? "short",
  monthFormat: options.monthFormat ?? "long",
  fixedWeeks: options.fixedWeeks ?? false,
  showOutsideDays: options.showOutsideDays ?? true,
  minDays: options.minDays,
  maxDays: options.maxDays,
  allowUnavailable: options.allowUnavailable ?? false,
})

const weekStartOf = (state: State) =>
  state.weekStartsOn ?? firstDayOfWeek(localeOf(state))
const unavailableDate = (state: State, date: ISODate) =>
  matchesDate(date, state.unavailable)
const outOfBounds = (state: State, date: ISODate) =>
  (state.min !== null && date < state.min) ||
  (state.max !== null && date > state.max)
// A date that can't be picked. The calendar being disabled is checked apart.
const blockedDate = (state: State, date: ISODate) =>
  outOfBounds(state, date) || unavailableDate(state, date)
const sameDates = (a: CalendarValue, b: CalendarValue) =>
  String(a) === String(b)
const gridMonth = (state: State, offset: number | undefined) =>
  addMonthsTo(state.month, offset ?? 0)
const isOutside = (state: State, props: CalendarDayProps) =>
  monthOf(props.value) !== gridMonth(state, props.offset)

const rangeRules = (state: State) => ({
  minDays: state.minDays,
  maxDays: state.maxDays,
  allowUnavailable: state.allowUnavailable,
  isUnavailable: (date: ISODate) => unavailableDate(state, date),
})
// Whether people could pick a value now: the calendar isn't disabled or read-only, the value fits the mode, no date is blocked, and the rules allow a range.
function isPickable(state: State, value: unknown) {
  if (isDisabled(state) || state.readOnly) {
    return false
  }
  const dates = selectedDates(normalizeValue(state.mode, value))
  if (
    [value]
      .flat()
      .some((date) => date != null && !dates.includes(date as ISODate)) ||
    dates.some((date) => blockedDate(state, date))
  ) {
    return false
  }
  return (
    state.mode !== "range" ||
    !dates.length ||
    isAllowedRange(dates[0], dates[1], rangeRules(state))
  )
}
const refusedEnd = (state: State, date: ISODate) =>
  state.mode === "range" &&
  state.anchor !== null &&
  date !== state.anchor &&
  rangeTo(state.anchor, date, rangeRules(state)) === null

// The month a calendar opens on: the selection's, else today's, within `min` and `max`.
function initialMonth(options: CalendarOptions, value: CalendarValue) {
  if (isISOMonth(options.month)) {
    return options.month
  }
  if (isISOMonth(options.defaultMonth)) {
    return options.defaultMonth
  }
  const [selected] = selectedDates(value)
  if (selected) {
    return monthOf(selected)
  }
  const today = dateOrNull(options.today) ?? todayDate(options.timeZone)
  return monthOf(
    clampDate(today, dateOrNull(options.min), dateOrNull(options.max))
  )
}

// The range days show: the one being picked, else the selected one.
function shownRange(state: State) {
  if (state.mode !== "range") {
    return null
  }
  if (state.anchor !== null) {
    const preview =
      state.hover === null
        ? null
        : rangeTo(state.anchor, state.hover, rangeRules(state))
    return preview ?? ([state.anchor, state.anchor] as const)
  }
  return state.value as [ISODate, ISODate] | null
}

// The date the tab stop goes to when no day has had focus: the selection if
// it shows, else today, else the first date that can be picked. Read for
// every day while the stop is checked, so it's kept for the state it read.
let preferredFor: { state: State; date: ISODate } | undefined
function preferredDate(state: State) {
  if (preferredFor?.state === state) {
    return preferredFor.date
  }
  const { start, end } = visibleRange(state.month, state.months)
  const shows = (date: ISODate) =>
    date >= start && date <= end && !blockedDate(state, date)
  let date =
    selectedDates(state.value).find(shows) ??
    (state.today !== null && shows(state.today) ? state.today : undefined)
  if (date === undefined) {
    const first = clampDate(start, state.min, state.max)
    date = first
    for (let day = first; day <= end; day = addDays(day, 1)) {
      if (!blockedDate(state, day)) {
        date = day
        break
      }
    }
  }
  preferredFor = { state, date }
  return date
}

function headingLabel(state: State) {
  const locale = localeOf(state)
  const options = { month: state.monthFormat, year: "numeric" } as const
  const first = `${state.month}-01`
  if (state.months === 1) {
    return formatDate(first, locale, options)
  }
  return formatDateRange(
    first,
    `${addMonthsTo(state.month, state.months - 1)}-01`,
    locale,
    options
  )
}

// The month and year selects: every month, and the years from min to max,
// or 10 either side of the year shown. The same object until those change,
// so a select doesn't render again when the selection or the tab stop moves.
const selectCache = new Map<string, CalendarSelectState>()
function selectState(state: State, kind: "month" | "year") {
  const locale = localeOf(state)
  const key = `${kind}|${state.month}|${locale}|${state.monthFormat}|${state.min}|${state.max}|${isDisabled(state)}`
  let cached = selectCache.get(key)
  if (!cached) {
    if (selectCache.size > 50) {
      selectCache.clear()
    }
    selectCache.set(key, (cached = buildSelectState(state, kind, locale)))
  }
  return cached
}

function buildSelectState(
  state: State,
  kind: "month" | "year",
  locale: string
) {
  const year = Number(state.month.slice(0, 4))
  const first = state.min && monthOf(state.min)
  const last = state.max && monthOf(state.max)
  const months = kind === "month"
  const from = months
    ? 1
    : Math.min(year, first ? Number(first.slice(0, 4)) : year - 10)
  const to = months
    ? 12
    : Math.max(year, last ? Number(last.slice(0, 4)) : year + 10)
  const names = monthNames(locale, state.monthFormat)
  const format = dateFormatter(locale, { year: "numeric" })
  const select: CalendarSelectState = {
    value: months ? Number(state.month.slice(5, 7)) : year,
    options: Array.from({ length: to - from + 1 }, (_, index) => {
      const value = from + index
      // A month outside min and max, in the year shown, can't be picked.
      const month = `${year}-${String(value).padStart(2, "0")}`
      return {
        value,
        // `setUTCFullYear` keeps years below 100 as they are, which `Date.UTC` doesn't.
        label: months
          ? names[index]
          : format.format(new Date(0).setUTCFullYear(value, 0, 1)),
        disabled:
          months && ((!!first && month < first) || (!!last && month > last)),
      }
    }),
    disabled: isDisabled(state),
  }
  return select
}

// The first month a month or year select picks, kept between min and max.
function selectedMonth(state: State, kind: "month" | "year", picked: number) {
  const [year, month] = state.month.split("-")
  const target =
    kind === "month"
      ? `${year}-${String(picked).padStart(2, "0")}`
      : `${String(picked).padStart(4, "0")}-${month}`
  if (state.min !== null && target < monthOf(state.min)) {
    return monthOf(state.min)
  }
  if (state.max !== null && target > monthOf(state.max)) {
    return monthOf(state.max)
  }
  return target
}

function stepTarget(state: State, direction: -1 | 1) {
  const by = state.pageBy === "page" ? state.months : 1
  const month = addMonthsTo(state.month, direction * by)
  const disabled =
    isDisabled(state) ||
    (direction < 0
      ? state.min !== null && monthOf(state.min) >= state.month
      : state.max !== null &&
        monthOf(state.max) <= addMonthsTo(state.month, state.months - 1))
  return { month, disabled }
}

// A grid's state, the same object until its month or layout changes, so a
// grid doesn't render again when a day's selection or the tab stop moves.
const grids = new Map<string, CalendarGridState>()
function gridState(state: State, offset: number) {
  const month = gridMonth(state, offset)
  const weekStartsOn = weekStartOf(state)
  const locale = localeOf(state)
  const first = offset === 0
  const last = offset === state.months - 1
  const key = `${month}|${locale}|${state.monthFormat}|${weekStartsOn}|${state.fixedWeeks}|${state.showOutsideDays}|${first}|${last}`
  let grid = grids.get(key)
  if (!grid) {
    if (grids.size > 50) {
      grids.clear()
    }
    grid = {
      month,
      label: formatDate(`${month}-01`, locale, {
        month: state.monthFormat,
        year: "numeric",
      }),
      weekdays: Array.from(
        { length: 7 },
        (_, index) => (weekStartsOn + index) % 7
      ),
      weeks: gridWeeks(month, {
        weekStartsOn,
        fixedWeeks: state.fixedWeeks,
        showOutsideDays: state.showOutsideDays,
        first,
        last,
      }),
    }
    grids.set(key, grid)
  }
  return grid
}

function dayState(state: State, props: CalendarDayProps) {
  const date = props.value
  const range = shownRange(state)
  const selected = range
    ? date >= range[0] && date <= range[1]
    : state.mode === "multiple"
      ? (state.value as ISODate[]).includes(date)
      : state.value === date
  return {
    date,
    label: dateFormatter(localeOf(state), { day: "numeric" }).format(
      Date.UTC(2000, 0, Number(date.slice(8)))
    ),
    selected,
    today: state.today === date,
    outside: isOutside(state, props),
    disabled:
      isDisabled(state) || blockedDate(state, date) || refusedEnd(state, date),
    unavailable: unavailableDate(state, date),
    rangeStart: !!range && range[0] === date,
    rangeEnd: !!range && range[1] === date,
    inRange: selected && !!range,
  }
}

/**
 * A calendar's behavior, which Date Picker shares. `picked` runs once a
 * press or a key completes a value: a date in single mode, a range's end.
 * `ValueReason` and `MonthReason` are the reasons its write methods accept,
 * which Date Picker widens with its own.
 */
function calendarApi<
  Options extends Omit<CalendarOptions, "controller" | "onValueChange">,
  S extends State,
  ValueReason extends string = CalendarValueChangeReason,
  MonthReason extends string = CalendarMonthChangeReason,
>(
  shared: PrimitiveContext<Options, S, string>,
  hooks: { picked?: (event: Event | undefined) => void } = {}
) {
  type ValueChangeReason = ValueReason | CalendarValueChangeReason
  type MonthChangeReason = MonthReason | CalendarMonthChangeReason
  const context = shared as unknown as PrimitiveContext<
    Omit<CalendarOptions, "onValueChange" | "onMonthChange">,
    State,
    string
  >
  const { store, options, element } = context
  const change = createChange(context)

  const roving = createRovingFocus<State, CalendarDayProps>(context, {
    slot: "day",
    key: "focused",
    // Unavailable dates stay focusable, as the date picker pattern asks; they just can't be picked.
    disabled: (day) => blockedDate(store.get(), day.key),
    // Days of the months around a grid show it, but focus moves through each
    // grid's own. Days past min and max can't take focus at all.
    focusable: (day) =>
      !isDisabled(store.get()) &&
      !isOutside(store.get(), day.props) &&
      !outOfBounds(store.get(), day.key),
    preferred: (day) => day.key === preferredDate(store.get()),
    claims: (state, day) =>
      !isOutside(state, day.props) && day.key === preferredDate(state),
    move: (event, { from, rtl }) => {
      if (event.ctrlKey || event.metaKey) {
        return
      }
      const state = store.get()
      const to = moveDate(event, from.key, {
        rtl,
        weekStartsOn: weekStartOf(state),
        min: state.min,
        max: state.max,
      })
      return to === undefined || moveFocus(to, "list-navigation", event)
        ? to
        : from.key
    },
  })
  // A day of next month that took focus before its month showed leaves the
  // page when it does, and the day that replaces it takes focus.
  const recovery = createFocusRecovery<CalendarDayProps>({
    fallback: (lost) => element("day", lost.key),
  })

  // A move to `approved` was asked before focus went, so landing there asks nothing.
  let approved: ISODate | null = null
  let pointer: PointerEvent | undefined
  // A day a press couldn't focus, which its click then leaves unfocused.
  let refused: ISODate | null = null
  function moveFocus(
    date: ISODate,
    reason: CalendarFocusedChangeReason,
    event?: Event
  ) {
    if (date === store.get().focused) {
      return true
    }
    if (dispatch(context, "onFocusedChange", date, { reason, event })) {
      return false
    }
    approved = date
    return true
  }

  // Focus a pointer or a script put on a day, past `moveFocus`. A stop the
  // calendar settles on itself, on load or as the months turn, asks nothing.
  function focusLanded(date: ISODate, event: FocusEvent) {
    const from = store.get().focused
    const press = pointer
    pointer = undefined
    if (date === approved) {
      approved = null
    } else if (
      date !== from &&
      from !== null &&
      dispatch(
        context,
        "onFocusedChange",
        date,
        press
          ? { reason: "item-press", event: press }
          : { reason: "focus-in", event }
      )
    ) {
      // Before the roving focus hears it, which would move the stop here.
      event.stopImmediatePropagation()
      if (press) {
        refused = date
      }
      roving.focus(from)
    }
  }

  function setAnchor(
    anchor: ISODate | null,
    hover: ISODate | null,
    reason: CalendarAnchorChangeReason,
    event?: Event
  ) {
    if (
      anchor !== store.get().anchor &&
      dispatch(context, "onAnchorChange", anchor, { reason, event })
    ) {
      return false
    }
    store.set({ anchor, hover })
    return true
  }

  function setMonth(month: ISOMonth, reason: MonthChangeReason, event?: Event) {
    if (!isISOMonth(month)) {
      return false
    }
    return change("month", month, { reason, event })
  }

  function setValue(
    value: CalendarValue,
    reason: ValueChangeReason,
    event?: Event
  ) {
    const state = store.get()
    return change("value", normalizeValue(state.mode, value), { reason, event })
  }

  function reveal(date: ISODate, reason: MonthChangeReason, event?: Event) {
    const state = store.get()
    const first = monthToShow(date, state.month, state.months, state.pageBy)
    if (first !== state.month) {
      setMonth(first, reason, event)
    }
  }

  function step(direction: -1 | 1, reason: MonthChangeReason, event?: Event) {
    const target = stepTarget(store.get(), direction)
    return !target.disabled && setMonth(target.month, reason, event)
  }

  function pick(date: ISODate, event: Event | undefined) {
    const state = store.get()
    if (isDisabled(state) || state.readOnly || blockedDate(state, date)) {
      return
    }
    if (state.mode === "multiple") {
      const value = state.value as ISODate[]
      setValue(
        value.includes(date)
          ? value.filter((selected) => selected !== date)
          : [...value, date],
        "item-press",
        event
      )
    } else if (state.mode === "range") {
      const pressed = pressRange(state.anchor, date, rangeRules(state))
      if (
        !setAnchor(
          pressed.anchor,
          pressed.anchor === null ? null : date,
          "item-press",
          event
        )
      ) {
        return
      }
      if (
        pressed.value &&
        (setValue(pressed.value, "item-press", event) ||
          sameDates(store.get().value, pressed.value))
      ) {
        hooks.picked?.(event)
      }
    } else if (state.deselectable && state.value === date) {
      setValue(null, "item-press", event)
    } else if (
      setValue(date, "item-press", event) ||
      store.get().value === date
    ) {
      hooks.picked?.(event)
    }
  }

  const api = {
    getValue: () => store.get().value,
    setValue: (
      value: CalendarValue,
      {
        reason = "imperative",
        event,
      }: CalendarChangeOptions<ValueChangeReason> = {}
    ) => isPickable(store.get(), value) && setValue(value, reason, event),
    getMonth: () => store.get().month,
    setMonth: (
      month: ISOMonth,
      {
        reason = "imperative",
        event,
      }: CalendarChangeOptions<MonthChangeReason> = {}
    ) => setMonth(month, reason, event),
    previous: ({
      reason = "imperative",
      event,
    }: CalendarChangeOptions<MonthChangeReason> = {}) =>
      step(-1, reason, event),
    next: ({
      reason = "imperative",
      event,
    }: CalendarChangeOptions<MonthChangeReason> = {}) => step(1, reason, event),
    focus(date?: ISODate) {
      if (date === undefined) {
        return roving.focus(store.get().focused ?? undefined)
      }
      if (!isISODate(date)) {
        return
      }
      const state = store.get()
      const target = clampDate(date, state.min, state.max)
      if (!moveFocus(target, "imperative")) {
        return
      }
      reveal(target, "imperative")
      roving.focus(target)
    },
    internal: {
      roving,
      recovery,
      focusLanded,
      setValue,
      setMonth,
      reveal,
      // A press on a day, or Enter or Space on one. A day of another month turns the months to it.
      press(
        props: CalendarDayProps,
        event: Event | undefined,
        el: HTMLElement | undefined
      ) {
        const state = store.get()
        if (isDisabled(state)) {
          return
        }
        // Safari doesn't focus a cell on click, so arrow keys would go nowhere.
        if (
          el &&
          !isOutside(state, props) &&
          !outOfBounds(state, props.value) &&
          el.ownerDocument.activeElement !== el &&
          // Only the refused press's own click counts clicks; a script's click() on that day still focuses it.
          (refused !== props.value ||
            !(event as MouseEvent | undefined)?.detail)
        ) {
          el.focus({ preventScroll: true })
        }
        pointer = undefined
        refused = null
        pick(props.value, event)
        if (
          isOutside(store.get(), props) &&
          !outOfBounds(state, props.value) &&
          moveFocus(props.value, "item-press", event)
        ) {
          reveal(props.value, "item-press", event)
          roving.focus(props.value)
        }
      },
      step: (direction: -1 | 1, event: Event | undefined) =>
        step(direction, direction < 0 ? "previous-press" : "next-press", event),
      select(kind: "month" | "year", value: number, event?: Event) {
        if (Number.isInteger(value)) {
          setMonth(
            selectedMonth(store.get(), kind, value),
            "select-change",
            event
          )
        }
      },
      keydown(event: KeyboardEvent, el: HTMLElement, props: CalendarDayProps) {
        if (event.defaultPrevented) {
          return
        }
        const state = store.get()
        if (
          (event.key === "Enter" || event.key === " ") &&
          !event.altKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault()
          pick(props.value, event)
          return
        }
        // Escape drops the start of a range being picked, before it closes anything.
        if (
          event.key === "Escape" &&
          state.anchor !== null &&
          setAnchor(null, null, "escape-key", event)
        ) {
          event.preventDefault()
          return
        }
        const moved = roving.keydown(event, el)
        if (!moved || moved.key === moved.from) {
          return
        }
        reveal(moved.key, "list-navigation", event)
        if (store.get().anchor !== null) {
          store.set({ hover: moved.key })
        }
      },
      pointerdown(event: PointerEvent) {
        pointer = event
        refused = null
      },
      // A press on a day past min or max changes nothing, so the focused day
      // keeps focus. That cell has no tabindex, and the page would blur it.
      mousedown(event: MouseEvent, props: CalendarDayProps) {
        if (outOfBounds(store.get(), props.value)) {
          event.preventDefault()
        }
      },
      hover(date: ISODate) {
        if (store.get().anchor !== null) {
          store.set({ hover: date })
        }
      },
      bindRoot(el: HTMLElement) {
        bindPageLocale(el, (pageLocale) => store.set({ pageLocale }))
        // Today on the client only, so server markup and hydration agree.
        if (options().today === undefined) {
          store.set({ today: todayDate(options().timeZone) })
        }
      },
    },
  }
  return api
}

function calendarState(options: CalendarOptions) {
  const mode = options.mode ?? "single"
  const value = normalizeValue(
    mode,
    options.value ?? options.defaultValue ?? null
  )
  const state: State = {
    ...calendarSettings(options),
    value,
    month: initialMonth(options, value),
    focused: null,
    anchor: null,
    hover: null,
    today: dateOrNull(options.today),
    pageLocale: null,
    formDisabled: false,
  }
  return state
}

// What new options write.
const calendarSync = (options: CalendarOptions) => ({
  ...calendarSettings(options),
  ...(options.value === undefined
    ? {}
    : { value: normalizeValue(options.mode ?? "single", options.value) }),
  ...(isISOMonth(options.month) ? { month: options.month } : {}),
  ...(options.today === undefined ? {} : { today: dateOrNull(options.today) }),
})

interface CalendarApi extends ReturnType<
  typeof calendarApi<CalendarOptions, State>
> {}

// A native <select> of the months or years, which turns the first month shown.
function selectSlot<S extends State, A extends Pick<CalendarApi, "internal">>(
  slot: SlotFactory<S, A>,
  kind: "month" | "year"
) {
  return slot<{}, CalendarSelectState>({
    state: (state) => selectState(state, kind),
    attrs: (state) => ({
      value: String(selectState(state, kind).value),
      "aria-label": kind === "month" ? "Month" : "Year",
      disabled: isDisabled(state) ? "" : undefined,
      "data-disabled": isDisabled(state) ? "" : undefined,
    }),
    on: {
      change: (event, { api, el }) =>
        el &&
        api.internal.select(
          kind,
          Number((el as HTMLSelectElement).value),
          event
        ),
    },
    // The selected option is written here, after the framework renders the options.
    bind(el, { store }) {
      const select = el as HTMLSelectElement
      const write = () => {
        const value = String(selectState(store.get(), kind).value)
        if (select.value !== value) {
          select.value = value
        }
      }
      write()
      return store.subscribe(write)
    },
  })
}

// The parts Calendar and Date Picker share: everything but the root.
function calendarSlots<
  S extends State,
  A extends Pick<CalendarApi, "internal">,
>(slot: SlotFactory<S, A>) {
  return {
    heading: slot<{}, CalendarHeadingState>({
      state: (state) => ({ month: state.month, label: headingLabel(state) }),
      // Screen readers hear the month change after Previous, Next or a key turns it.
      attrs: (state, { id }) => ({
        id: `${id}-heading`,
        "aria-live": "polite",
      }),
    }),

    previous: slot<{}, CalendarStepState>({
      state: (state) => stepTarget(state, -1),
      attrs: (state) => {
        const { disabled } = stepTarget(state, -1)
        return {
          type: "button",
          "aria-label": "Previous month",
          "aria-disabled": disabled ? "true" : undefined,
          "data-disabled": disabled ? "" : undefined,
        }
      },
      press: ({ api }, event) => api.internal.step(-1, event),
    }),

    next: slot<{}, CalendarStepState>({
      state: (state) => stepTarget(state, 1),
      attrs: (state) => {
        const { disabled } = stepTarget(state, 1)
        return {
          type: "button",
          "aria-label": "Next month",
          "aria-disabled": disabled ? "true" : undefined,
          "data-disabled": disabled ? "" : undefined,
        }
      },
      press: ({ api }, event) => api.internal.step(1, event),
    }),

    "month-select": selectSlot(slot, "month"),
    "year-select": selectSlot(slot, "year"),

    grid: slot<CalendarGridProps, CalendarGridState>({
      role: "grid",
      keys: { none: "Focus stays on a day, whose keydown handles them." },
      props: { offset: "number" },
      state: (state, { props }) => gridState(state, props.offset ?? 0),
      attrs: (state, { props }) => {
        const month = gridMonth(state, props.offset)
        return {
          "aria-label": formatDate(`${month}-01`, localeOf(state), {
            month: "long",
            year: "numeric",
          }),
          "aria-multiselectable": state.mode === "single" ? undefined : "true",
          "aria-readonly": state.readOnly ? "true" : undefined,
          "aria-disabled": isDisabled(state) ? "true" : undefined,
          "data-disabled": isDisabled(state) ? "" : undefined,
        }
      },
    }),

    weekdays: slot({ role: "row" }),

    weekday: slot<CalendarWeekdayProps, CalendarWeekdayState>({
      role: "columnheader",
      props: { index: "number" },
      state: (state, { props }) => {
        const weekStartsOn = weekStartOf(state)
        const locale = localeOf(state)
        return {
          weekday: (weekStartsOn + props.index) % 7,
          label: weekdayNames(locale, state.weekdayFormat, weekStartsOn)[
            props.index
          ]!,
          name: weekdayNames(locale, "long", weekStartsOn)[props.index]!,
        }
      },
      attrs: (state, { props }) => ({
        "aria-label": weekdayNames(localeOf(state), "long", weekStartOf(state))[
          props.index
        ],
      }),
    }),

    week: slot({ role: "row" }),

    day: slot<CalendarDayProps, CalendarDayState>({
      role: "gridcell",
      focus: (state, { props }) =>
        dayState(state, props).outside
          ? {
              none: "Days of the months around show here, but focus moves through each grid's own.",
            }
          : "roving",
      props: { value: "string", offset: { kind: "number", from: "grid" } },
      // A key press moves the stop between two days; only they render again.
      selects: selects<State, A, CalendarDayProps>({
        focused: ({ key }) => [key, null],
      }),
      state: (state, { props }) => dayState(state, props),
      attrs: (state, part) => {
        const { props, api } = part
        const day = dayState(state, props)
        const range = shownRange(state)
        return {
          tabindex:
            isDisabled(state) || day.outside || outOfBounds(state, props.value)
              ? undefined
              : api.internal.roving.tabIndex(state, part),
          "aria-label": formatDate(props.value, localeOf(state)),
          "aria-selected": day.outside ? undefined : String(day.selected),
          "aria-disabled": day.disabled ? "true" : undefined,
          "aria-current": day.today ? "date" : undefined,
          "data-value": props.value,
          "data-selected": day.selected ? "" : undefined,
          "data-today": day.today ? "" : undefined,
          "data-outside": day.outside ? "" : undefined,
          "data-disabled": day.disabled ? "" : undefined,
          "data-unavailable": day.unavailable ? "" : undefined,
          "data-range-start": day.rangeStart ? "" : undefined,
          "data-range-end": day.rangeEnd ? "" : undefined,
          "data-range-middle":
            day.inRange && !day.rangeStart && !day.rangeEnd ? "" : undefined,
          "data-preview":
            range && state.anchor !== null && day.inRange ? "" : undefined,
        }
      },
      press: ({ api, props, el }, event) =>
        api.internal.press(props, event, el),
      on: {
        keydown: (event, { api, el, props }) =>
          api.internal.keydown(event, el!, props),
        pointerdown: (event, { api }) => api.internal.pointerdown(event),
        mousedown: (event, { api, props }) =>
          api.internal.mousedown(event, props),
        pointerenter: (_event, { api, props }) =>
          api.internal.hover(props.value),
      },
      bind: (el, part) => {
        const landed = (event: FocusEvent) =>
          part.api.internal.focusLanded(part.props.value, event)
        // Ahead of the roving focus, which moves the stop to where focus lands.
        el.addEventListener("focus", landed)
        const cleanups = [
          part.api.internal.roving.bind(el, part),
          part.api.internal.recovery.bind(el, part),
          () => el.removeEventListener("focus", landed),
        ]
        return () => cleanups.forEach((cleanup) => cleanup())
      },
    }),
  }
}

export {
  blockedDate,
  type CalendarModelState,
  calendarSettings,
  calendarApi,
  calendarSlots,
  calendarState,
  calendarSync,
  isDisabled,
  isPickable,
  localeOf,
  preferredDate,
  rangeRules,
}

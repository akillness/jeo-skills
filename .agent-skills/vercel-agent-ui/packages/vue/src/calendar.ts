import type { ChangeDetails } from "@ui-sdk/core"
import {
  calendar as calendarPrimitive,
  type CalendarAnchorChangeReason,
  type CalendarController,
  type CalendarFocusedChangeReason,
  type CalendarGridCell,
  type CalendarMode,
  type CalendarMonthChangeReason,
  type CalendarSelectState,
  type CalendarValue,
  type CalendarValueChangeReason,
  type DateMatchers,
  type ISOMonth,
} from "@ui-sdk/core/calendar"
import type { ISODate } from "@ui-sdk/core/date"
import {
  defineComponent,
  Fragment,
  h,
  inject,
  provide,
  type PropType,
  type SlotsType,
  type VNode,
} from "vue"
import { CalendarKey, GridKey } from "./calendar-context"
import { slotContent } from "./children"
import { withElement } from "./create-parts"
import {
  optionalBoolean,
  orModel,
  usePart,
  usePrimitive,
  type PartSlots,
} from "./use-primitive"
import { readOnlyOf } from "./text-control"

function useCalendar(part: string) {
  const context = inject(CalendarKey)
  if (!context) {
    throw new Error(
      `${part} must be used inside <Calendar> or <DatePickerContent>.`
    )
  }
  return context
}

function useGrid(part: string) {
  const context = inject(GridKey)
  if (!context) {
    throw new Error(`${part} must be used inside <CalendarGrid>.`)
  }
  return context
}

const calendarValue = {
  type: null as unknown as PropType<CalendarValue>,
  default: undefined,
}

/**
 * Months of days with one tab stop. Without content it renders Previous, the
 * heading and Next, and a grid for each month.
 * @stable
 */
const Calendar = withElement(
  "div",
  defineComponent({
    name: "Calendar",
    inheritAttrs: false,
    props: {
      mode: String as PropType<CalendarMode>,
      value: calendarValue,
      modelValue: calendarValue,
      defaultValue: calendarValue,
      month: String as PropType<ISOMonth>,
      defaultMonth: String as PropType<ISOMonth>,
      min: String,
      max: String,
      unavailable: null as unknown as PropType<DateMatchers>,
      disabled: optionalBoolean,
      readOnly: optionalBoolean,
      deselectable: optionalBoolean,
      months: Number,
      pageBy: String as PropType<"month" | "page">,
      locale: String,
      weekStartsOn: Number,
      weekdayFormat: String as PropType<"narrow" | "short" | "long">,
      monthFormat: String as PropType<"narrow" | "short" | "long">,
      fixedWeeks: optionalBoolean,
      showOutsideDays: optionalBoolean,
      today: String,
      timeZone: String,
      minDays: Number,
      maxDays: Number,
      allowUnavailable: optionalBoolean,
      controller: Object as PropType<CalendarController>,
      debug: optionalBoolean,
    },
    emits: {
      "update:value": (_value: CalendarValue) => true,
      "update:modelValue": (_value: CalendarValue) => true,
      valueChange: (
        _value: CalendarValue,
        _details: ChangeDetails<CalendarValueChangeReason>
      ) => true,
      "update:month": (_month: ISOMonth) => true,
      monthChange: (
        _month: ISOMonth,
        _details: ChangeDetails<CalendarMonthChangeReason>
      ) => true,
      focusedChange: (
        _date: ISODate,
        _details: ChangeDetails<CalendarFocusedChangeReason>
      ) => true,
      anchorChange: (
        _anchor: ISODate | null,
        _details: ChangeDetails<CalendarAnchorChangeReason>
      ) => true,
    },
    slots: Object as PartSlots<typeof calendarPrimitive, "root">,
    setup(props, { slots, attrs, emit }) {
      const calendar = usePrimitive(calendarPrimitive, () => ({
        mode: props.mode,
        value: orModel(props.value, props.modelValue),
        defaultValue: props.defaultValue,
        month: props.month,
        defaultMonth: props.defaultMonth,
        min: props.min,
        max: props.max,
        unavailable: props.unavailable,
        disabled: props.disabled,
        readOnly: readOnlyOf(props, attrs),
        deselectable: props.deselectable,
        onFocusedChange: (
          date: ISODate,
          details: ChangeDetails<CalendarFocusedChangeReason>
        ) => emit("focusedChange", date, details),
        onAnchorChange: (
          anchor: ISODate | null,
          details: ChangeDetails<CalendarAnchorChangeReason>
        ) => emit("anchorChange", anchor, details),
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
        // The change events run first, so canceling one also keeps v-model as it was.
        onValueChange: (
          value: CalendarValue,
          details: ChangeDetails<CalendarValueChangeReason>
        ) => {
          emit("valueChange", value, details)
          if (details.canceled) {
            return
          }
          emit("update:value", value)
          emit("update:modelValue", value)
        },
        onMonthChange: (
          month: ISOMonth,
          details: ChangeDetails<CalendarMonthChangeReason>
        ) => {
          emit("monthChange", month, details)
          if (!details.canceled) {
            emit("update:month", month)
          }
        },
      }))
      provide(CalendarKey, calendar)
      const defaultContent = () => [
        h("div", [h(CalendarPrevious), h(CalendarHeading), h(CalendarNext)]),
        ...Array.from(
          { length: Math.max(1, Math.floor(props.months ?? 1) || 1) },
          (_, offset) => h(CalendarGrid, { key: offset, offset })
        ),
      ]
      return usePart(calendar, "root", undefined, undefined, {
        tag: "div",
        children: (state) =>
          slotContent(slots.default, { state }) ?? defaultContent(),
      })
    },
  })
)

/**
 * The months shown, like "October 2026". Screen readers hear it change.
 * @stable
 */
const CalendarHeading = withElement(
  "h2",
  defineComponent({
    name: "CalendarHeading",
    inheritAttrs: false,
    slots: Object as PartSlots<typeof calendarPrimitive, "heading">,
    setup(_, { slots }) {
      const calendar = useCalendar("CalendarHeading")
      return usePart(calendar, "heading", undefined, undefined, {
        tag: "h2",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.label,
      })
    },
  })
)

function selectPart<S extends "month-select" | "year-select">(
  name: string,
  slot: S
) {
  return withElement(
    "select",
    defineComponent({
      name,
      inheritAttrs: false,
      slots: Object as PartSlots<typeof calendarPrimitive, S>,
      setup(_, { slots }) {
        const calendar = useCalendar(name)
        // The core writes the selected option as it changes, so the select only
        // renders where it starts, on the option, which the server renders too.
        const options = (state: CalendarSelectState) =>
          state.options.map((option) =>
            h(
              "option",
              {
                key: option.value,
                value: option.value,
                disabled: option.disabled,
                selected: option.value === state.value,
              },
              option.label
            )
          )
        return usePart(calendar, slot, undefined, undefined, {
          tag: "select",
          children: (state) =>
            slotContent(slots.default, { state }) ?? options(state),
          // The selected option carries the value, not the select.
          extend: ({ value: _, ...part }) => part,
        })
      },
    })
  )
}

/**
 * A native select of the months, in the locale, that turns the first month shown.
 * @stable
 */
const CalendarMonthSelect = selectPart("CalendarMonthSelect", "month-select")
/**
 * A native select of the years from `min` to `max`, or 10 either side of the year shown.
 * @stable
 */
const CalendarYearSelect = selectPart("CalendarYearSelect", "year-select")

function stepPart<S extends "previous" | "next">(
  name: string,
  slot: S,
  text: string
) {
  return withElement(
    "button",
    defineComponent({
      name,
      inheritAttrs: false,
      slots: Object as PartSlots<typeof calendarPrimitive, S>,
      setup(_, { slots }) {
        const calendar = useCalendar(name)
        return usePart(calendar, slot, undefined, undefined, {
          tag: "button",
          children: (state) => slotContent(slots.default, { state }) ?? text,
        })
      },
    })
  )
}

/**
 * Shows the month before. Named "Previous month"; pass `aria-label` in another language.
 * @stable
 */
const CalendarPrevious = stepPart("CalendarPrevious", "previous", "‹")
/**
 * Shows the month after. Named "Next month"; pass `aria-label` in another language.
 * @stable
 */
const CalendarNext = stepPart("CalendarNext", "next", "›")

/**
 * One month's grid, a table. `offset` picks which of the months shown, from 0.
 * Without content it renders its weekdays and weeks.
 * @stable
 */
const CalendarGrid = withElement(
  "table",
  defineComponent({
    name: "CalendarGrid",
    inheritAttrs: false,
    props: { offset: { type: Number, default: 0 } },
    slots: Object as PartSlots<typeof calendarPrimitive, "grid">,
    setup(props, { slots }) {
      const calendar = useCalendar("CalendarGrid")
      const part = () => ({ offset: props.offset, id: String(props.offset) })
      const grid = usePart(calendar, "grid", part, undefined, {
        tag: "table",
        children: (state) =>
          slotContent(slots.default, { state }) ?? [
            h(CalendarWeekdays),
            h(CalendarWeeks),
          ],
      })
      provide(GridKey, { offset: () => props.offset, state: grid.state })
      return grid
    },
  })
)

/**
 * The header row of weekday names, a weekday in each column. Its default slot
 * gets `{ index }` and renders the column's header, like
 * `<CalendarWeekday :index="index" class="…" />`.
 * @stable
 */
const CalendarWeekdays = withElement(
  "thead",
  defineComponent({
    name: "CalendarWeekdays",
    inheritAttrs: false,
    slots: Object as SlotsType<{
      default?: (scope: { index: number }) => VNode[]
    }>,
    setup(_, { slots, attrs }) {
      const calendar = useCalendar("CalendarWeekdays")
      const grid = useGrid("CalendarWeekdays")
      return () =>
        h(
          "thead",
          attrs,
          h(
            "tr",
            calendar.slot("weekdays", { id: String(grid.offset()) }),
            grid.state.weekdays.map((weekday, index) =>
              slots.default
                ? h(Fragment, { key: weekday }, slots.default({ index }))
                : h(CalendarWeekday, { key: weekday, index })
            )
          )
        )
    },
  })
)

/**
 * A weekday's column header. Shows its name in `weekdayFormat` unless it has content.
 * @stable
 */
const CalendarWeekday = withElement(
  "th",
  defineComponent({
    name: "CalendarWeekday",
    inheritAttrs: false,
    props: { index: { type: Number, required: true } },
    slots: Object as PartSlots<typeof calendarPrimitive, "weekday">,
    setup(props, { slots, attrs }) {
      const calendar = useCalendar("CalendarWeekday")
      const grid = useGrid("CalendarWeekday")
      const part = () => ({
        index: props.index,
        id: `${grid.offset()}-${props.index}`,
      })
      return usePart(
        calendar,
        "weekday",
        part,
        () => ({ scope: "col", ...attrs }),
        {
          tag: "th",
          children: (state) =>
            slotContent(slots.default, { state }) ?? state.label,
        }
      )
    },
  })
)

/**
 * The weeks of the grid's month, a row each, with a day in each cell. Its
 * default slot gets `{ cell }` and renders the cell's day, like
 * `<CalendarDay :value="cell.date" class="…" />`. A cell that shows nothing
 * stays an empty cell.
 * @stable
 */
const CalendarWeeks = withElement(
  "tbody",
  defineComponent({
    name: "CalendarWeeks",
    inheritAttrs: false,
    slots: Object as SlotsType<{
      default?: (scope: { cell: CalendarGridCell }) => VNode[]
    }>,
    setup(_, { slots, attrs }) {
      const calendar = useCalendar("CalendarWeeks")
      const grid = useGrid("CalendarWeeks")
      return () => {
        const offset = grid.offset()
        return h(
          "tbody",
          attrs,
          grid.state.weeks.map((week, index) =>
            h(
              "tr",
              {
                key: week[0]!.date,
                ...calendar.slot("week", { id: `${offset}-${index}` }),
              },
              week.map((cell) =>
                cell.hidden
                  ? h("td", { key: cell.date })
                  : slots.default
                    ? h(Fragment, { key: cell.date }, slots.default({ cell }))
                    : h(CalendarDay, { key: cell.date, value: cell.date })
              )
            )
          )
        )
      }
    },
  })
)

/**
 * A day. Shows the day of the month unless it has content; arrow keys move between days.
 * @stable
 */
const CalendarDay = withElement(
  "td",
  defineComponent({
    name: "CalendarDay",
    inheritAttrs: false,
    props: { value: { type: String, required: true } },
    slots: Object as PartSlots<typeof calendarPrimitive, "day">,
    setup(props, { slots }) {
      const calendar = useCalendar("CalendarDay")
      const grid = inject(GridKey, null)
      const part = () => ({ value: props.value, offset: grid?.offset() ?? 0 })
      return usePart(calendar, "day", part, undefined, {
        tag: "td",
        children: (state) =>
          slotContent(slots.default, { state }) ?? state.label,
      })
    },
  })
)

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

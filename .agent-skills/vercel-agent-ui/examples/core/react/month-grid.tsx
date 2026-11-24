import * as React from "react"
import { createRovingFocus, definePrimitive, selects } from "@ui-sdk/core"
import {
  addDays,
  addMonths,
  firstDayOfWeek,
  formatDate,
  isSameMonth,
  monthGrid,
  startOfMonth,
  weekdayNames,
  type ISODate,
} from "@ui-sdk/core/date"
import { createParts } from "@ui-sdk/react/primitive"

type MonthOptions = {
  defaultValue: ISODate
  locale: string
}

type MonthState = {
  value: ISODate
  month: ISODate
  focused: string | null
  locale: string
}

type MonthRootState = {
  title: string
  weekdays: string[]
  weeks: ISODate[][]
}

const steps: Record<string, number> = {
  ArrowUp: -7,
  ArrowDown: 7,
  ArrowLeft: -1,
  ArrowRight: 1,
}

const month = definePrimitive({
  name: "month",
  options: { defaultValue: "string", locale: "string" },
  state: (options: MonthOptions): MonthState => ({
    value: options.defaultValue,
    month: startOfMonth(options.defaultValue),
    focused: null,
    locale: options.locale,
  }),
  sync: (options) => ({ locale: options.locale }),
  api: (context) => {
    const { store } = context
    const roving = createRovingFocus<MonthState, { value: string }>(context, {
      slot: "day",
      key: "focused",
      remember: false,
      preferred: (day) => day.key === store.get().value,
      claims: (state, day) => day.key === state.value,
      move: (event, { from, rtl }) => {
        const by = steps[event.key]
        return by === undefined
          ? undefined
          : addDays(from.key, rtl && Math.abs(by) === 1 ? -by : by)
      },
    })
    let view: (MonthRootState & { month: ISODate; locale: string }) | undefined
    const viewOf = (state: MonthState) => {
      if (view?.month !== state.month || view.locale !== state.locale) {
        const weekStartsOn = firstDayOfWeek(state.locale)
        view = {
          month: state.month,
          locale: state.locale,
          title: formatDate(state.month, state.locale, {
            month: "long",
            year: "numeric",
          }),
          weekdays: weekdayNames(state.locale, "short", weekStartsOn),
          weeks: monthGrid(state.month, { weekStartsOn }),
        }
      }
      return view
    }
    return {
      roving,
      viewOf,
      select: (date: ISODate) => store.set({ value: date }),
      turn: (by: number) =>
        store.set({ month: addMonths(store.get().month, by) }),
      keydown(event: KeyboardEvent, el: HTMLElement) {
        const moved = roving.keydown(event, el)
        if (moved && !isSameMonth(moved.key, store.get().month)) {
          store.set({ month: startOfMonth(moved.key) })
        }
      },
    }
  },
  slots: (slot) => ({
    root: slot<{}, MonthRootState>({
      state: (state, { api }) => {
        const { title, weekdays, weeks } = api.viewOf(state)
        return { title, weekdays, weeks }
      },
    }),
    grid: slot({ attrs: () => ({ role: "grid" }) }),
    day: slot<{ value: string }, { selected: boolean; outside: boolean }>({
      props: { value: "string" },
      selects: selects({ focused: ({ key }) => [key, null] }),
      state: (state, { key }) => ({
        selected: key === state.value,
        outside: !isSameMonth(key, state.month),
      }),
      attrs: (state, part) => ({
        type: "button",
        role: "gridcell",
        tabindex: part.api.roving.tabIndex(state, part),
        "aria-selected": String(part.key === state.value),
        "aria-label": formatDate(part.key, state.locale),
        "data-selected": part.key === state.value ? "" : undefined,
        "data-outside": isSameMonth(part.key, state.month) ? undefined : "",
      }),
      press: ({ api, key }) => api.select(key),
      on: { keydown: (event, { el, api }) => api.keydown(event, el!) },
      bind: (el, part) => part.api.roving.bind(el, part),
    }),
    previous: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.turn(-1),
    }),
    next: slot({
      attrs: () => ({ type: "button" }),
      press: ({ api }) => api.turn(1),
    }),
  }),
})

const parts = createParts(month, {
  root: "div",
  grid: "div",
  day: "button",
  previous: "button",
  next: "button",
})

const Month = parts.Root

const MonthGrid = parts.Grid

const MonthDay = parts.Day

const MonthPrevious = parts.Previous

const MonthNext = parts.Next

function Example() {
  const [locale, setLocale] = React.useState("en-US")
  return (
    <div data-slot="stack">
      <select
        aria-label="Locale"
        value={locale}
        onChange={(event) => setLocale(event.target.value)}
      >
        <option value="en-US">English (US)</option>
        <option value="de-DE">Deutsch</option>
      </select>
      <Month defaultValue="2026-10-16" locale={locale}>
        {({ title, weekdays, weeks }) => (
          <>
            <div data-slot="row">
              <MonthPrevious aria-label="Previous month">‹</MonthPrevious>
              <span aria-live="polite" data-slot="month-heading">
                {title}
              </span>
              <MonthNext aria-label="Next month">›</MonthNext>
            </div>
            <MonthGrid aria-label={title}>
              <div role="row" data-slot="month-row">
                {weekdays.map((name) => (
                  <span key={name} role="columnheader">
                    {name}
                  </span>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week[0]} role="row" data-slot="month-row">
                  {week.map((day) => (
                    <MonthDay key={day} value={day}>
                      {Number(day.slice(8))}
                    </MonthDay>
                  ))}
                </div>
              ))}
            </MonthGrid>
          </>
        )}
      </Month>
    </div>
  )
}

export {
  Example,
  month,
  Month,
  MonthDay,
  MonthGrid,
  MonthNext,
  MonthPrevious,
  type MonthOptions,
  type MonthRootState,
  type MonthState,
}

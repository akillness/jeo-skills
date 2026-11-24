"use client"

import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "@ui-sdk/react/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

const priceOf = (date: string) => 80 + ((Number(date.slice(8)) * 7) % 5) * 10

function Example() {
  return (
    <Calendar today="2026-10-16" defaultValue="2026-10-16">
      <div data-slot="row">
        <CalendarPrevious data-variant="ghost">
          <ChevronLeftIcon aria-hidden="true" />
        </CalendarPrevious>
        <CalendarHeading />
        <CalendarNext data-variant="ghost">
          <ChevronRightIcon aria-hidden="true" />
        </CalendarNext>
      </div>
      <CalendarGrid>
        <CalendarWeekdays>
          {(index) => (
            <CalendarWeekday index={index}>
              {(state) => (
                <abbr
                  title={state.name}
                  data-weekend={
                    state.weekday === 0 || state.weekday === 6 || undefined
                  }
                >
                  {state.label}
                </abbr>
              )}
            </CalendarWeekday>
          )}
        </CalendarWeekdays>
        <CalendarWeeks>
          {(cell) => (
            <CalendarDay value={cell.date}>
              {(state) => (
                <span data-slot="stack">
                  <span>{state.label}</span>
                  {!state.outside && !state.disabled && (
                    <span data-slot="hint">${priceOf(state.date)}</span>
                  )}
                </span>
              )}
            </CalendarDay>
          )}
        </CalendarWeeks>
      </CalendarGrid>
    </Calendar>
  )
}

export { Example }

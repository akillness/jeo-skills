"use client"

import { todayDate } from "@ui-sdk/core/date"
import * as React from "react"
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
  createCalendarController,
} from "@ui-sdk/react/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

function Example() {
  const [calendar] = React.useState(() => createCalendarController())
  const select = (date: string) => {
    calendar.setValue(date)
    calendar.focus(date)
  }
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => select("2026-12-25")}>
          Go to Christmas
        </button>
        <button type="button" onClick={() => select(todayDate())}>
          Today
        </button>
      </div>
      <Calendar
        controller={calendar}
        defaultValue="2026-10-16"
        defaultMonth="2026-10"
      >
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
            {(index) => <CalendarWeekday index={index} />}
          </CalendarWeekdays>
          <CalendarWeeks>
            {(cell) => <CalendarDay value={cell.date} />}
          </CalendarWeeks>
        </CalendarGrid>
      </Calendar>
    </div>
  )
}

export { Example }

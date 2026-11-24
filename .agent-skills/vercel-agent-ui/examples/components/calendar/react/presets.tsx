"use client"

import { addDays, endOfMonth, startOfMonth } from "@ui-sdk/core/date"
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

const today = "2026-10-16"
const presets = [
  { label: "Last 7 Days", range: [addDays(today, -6), today] },
  { label: "This Month", range: [startOfMonth(today), endOfMonth(today)] },
  { label: "Next 30 Days", range: [today, addDays(today, 29)] },
] as const

function Example() {
  const [calendar] = React.useState(() => createCalendarController())

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        {presets.map((preset) => (
          <button
            key={preset.label}
            type="button"
            data-size="sm"
            onClick={() => {
              calendar.setValue([...preset.range])
              calendar.focus(preset.range[0])
            }}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <Calendar
        mode="range"
        controller={calendar}
        today={today}
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

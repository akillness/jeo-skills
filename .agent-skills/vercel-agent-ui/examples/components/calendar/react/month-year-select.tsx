"use client"

import {
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
} from "@ui-sdk/react/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

function Example() {
  return (
    <Calendar defaultMonth="1990-06" min="1920-01-01" max="2026-10-16">
      <div data-slot="row">
        <CalendarPrevious data-variant="ghost">
          <ChevronLeftIcon aria-hidden="true" />
        </CalendarPrevious>
        <CalendarHeading />
        <div data-slot="row">
          <CalendarMonthSelect />
          <CalendarYearSelect />
        </div>
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
  )
}

export { Example }

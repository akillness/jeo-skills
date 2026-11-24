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

function Example() {
  return (
    <Calendar readOnly defaultValue="2026-10-16">
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
  )
}

export { Example }

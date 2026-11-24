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

export function Example() {
  return (
    <div dir="rtl" lang="ar">
      <Calendar defaultValue="2026-10-16">
        <div data-slot="row">
          <CalendarPrevious data-variant="ghost">
            <ChevronLeftIcon />
          </CalendarPrevious>
          <CalendarHeading />
          <CalendarNext data-variant="ghost">
            <ChevronRightIcon />
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

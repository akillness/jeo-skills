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
  type CalendarValue,
} from "@ui-sdk/react/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

export function Example() {
  const [value, setValue] = React.useState<CalendarValue>("2026-10-16")
  const [month, setMonth] = React.useState("2026-10")
  const log = useLog()
  return (
    <div>
      <Calendar
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          log(`Selected ${String(next)} (${details.reason})`)
        }}
        month={month}
        onMonthChange={(next, details) => {
          setMonth(next)
          log(`Showing ${next} (${details.reason})`)
        }}
      >
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

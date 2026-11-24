import {
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  DatePicker,
  DatePickerContent,
  DatePickerHint,
  DatePickerInput,
  DatePickerTrigger,
} from "@ui-sdk/react/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"
import type { DatePickerValue } from "@ui-sdk/react/date-picker"

function Example() {
  const [value, setValue] = React.useState<DatePickerValue>("2026-10-16")
  const log = useLog()
  return (
    <DatePicker
      value={value}
      onValueChange={(next, details) => {
        setValue(next)
        log(`${next ?? "No date"} (${details.reason})`)
      }}
    >
      <div data-slot="row">
        <DatePickerInput aria-label="Due date" />
        <DatePickerTrigger data-variant="ghost">
          <CalendarIcon aria-hidden="true" />
        </DatePickerTrigger>
      </div>
      <DatePickerHint />
      <DatePickerContent>
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
      </DatePickerContent>
    </DatePicker>
  )
}

export { Example }

"use client"

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
  DatePickerInput,
  DatePickerTrigger,
  type DatePickerValue,
} from "@ui-sdk/react/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"

function Example() {
  const [value, setValue] = React.useState<DatePickerValue>(null)
  const [asking, setAsking] = React.useState(false)
  return (
    <DatePicker
      mode="range"
      defaultMonth="2026-10"
      value={value}
      onValueChange={(next) => {
        setValue(next)
        setAsking(false)
      }}
      onOpenChange={(open) => open && setAsking(false)}
      dismissible={value !== null}
      onDismissAttempt={() => setAsking(true)}
    >
      <div data-slot="row">
        <DatePickerInput aria-label="Check in" placeholder="Check in" />
        <span data-slot="hint">–</span>
        <DatePickerInput end aria-label="Check out" placeholder="Check out" />
        <DatePickerTrigger data-variant="ghost">
          <CalendarIcon aria-hidden="true" />
        </DatePickerTrigger>
      </div>
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
        {asking && (
          <p data-slot="hint" role="alert">
            Pick a check-out date to finish your stay.
          </p>
        )}
      </DatePickerContent>
    </DatePicker>
  )
}

export { Example }

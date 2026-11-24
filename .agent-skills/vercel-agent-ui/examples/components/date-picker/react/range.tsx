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
} from "@ui-sdk/react/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import * as React from "react"

function Example() {
  const [field, setField] = React.useState<HTMLElement | null>(null)
  return (
    <DatePicker
      mode="range"
      months={2}
      monthFormat="short"
      defaultValue={["2026-10-12", "2026-10-16"]}
    >
      <div data-slot="row" ref={setField}>
        <DatePickerInput aria-label="Check in" placeholder="Check in" />
        <span data-slot="hint">–</span>
        <DatePickerInput end aria-label="Check out" placeholder="Check out" />
        <DatePickerTrigger data-variant="ghost">
          <CalendarIcon aria-hidden="true" />
        </DatePickerTrigger>
      </div>
      <DatePickerContent anchor={field} align="center">
        <div data-slot="row">
          <CalendarPrevious data-variant="ghost">
            <ChevronLeftIcon aria-hidden="true" />
          </CalendarPrevious>
          <CalendarHeading />
          <CalendarNext data-variant="ghost">
            <ChevronRightIcon aria-hidden="true" />
          </CalendarNext>
        </div>
        <div data-slot="row">
          <CalendarGrid>
            <CalendarWeekdays>
              {(index) => <CalendarWeekday index={index} />}
            </CalendarWeekdays>
            <CalendarWeeks>
              {(cell) => <CalendarDay value={cell.date} />}
            </CalendarWeeks>
          </CalendarGrid>
          <CalendarGrid offset={1}>
            <CalendarWeekdays>
              {(index) => <CalendarWeekday index={index} />}
            </CalendarWeekdays>
            <CalendarWeeks>
              {(cell) => <CalendarDay value={cell.date} />}
            </CalendarWeeks>
          </CalendarGrid>
        </div>
      </DatePickerContent>
    </DatePicker>
  )
}

export { Example }

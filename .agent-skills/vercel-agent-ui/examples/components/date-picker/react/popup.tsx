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
  DatePickerHint,
  DatePickerInput,
  DatePickerTrigger,
} from "@ui-sdk/react/date-picker"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"

function Example() {
  const log = useLog()
  const [anchor, setAnchor] = React.useState<HTMLElement | null>(null)
  const [container, setContainer] = React.useState<HTMLElement | null>(null)
  return (
    <div data-slot="stack">
      <DatePicker
        defaultOpen={false}
        presentation="auto"
        container={container}
        onOpenChange={(open, details) =>
          log(`${open ? "Opened" : "Closed"} (${details.reason})`)
        }
        onOpenChangeComplete={(open) => open || log("Finished closing")}
        onMonthChange={(month, details) =>
          log(`Showing ${month} (${details.reason})`)
        }
      >
        <div data-slot="row" ref={setAnchor}>
          <DatePickerInput aria-label="Due date" />
          <DatePickerTrigger data-variant="ghost">
            <CalendarIcon aria-hidden="true" />
          </DatePickerTrigger>
        </div>
        <DatePickerHint />
        <DatePickerContent
          anchor={anchor}
          sideOffset={6}
          collisionPadding={16}
          keepMounted
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
        </DatePickerContent>
      </DatePicker>
      <div ref={setContainer} />
    </div>
  )
}

export { Example }

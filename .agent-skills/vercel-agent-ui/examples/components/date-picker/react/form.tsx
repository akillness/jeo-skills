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
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/react/field"
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"

function Example() {
  const log = useLog()
  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        log(`Submitted due=${new FormData(event.currentTarget).get("due")}`)
      }}
    >
      <Field name="due">
        <FieldLabel>Due date</FieldLabel>
        <DatePicker required>
          <div data-slot="row">
            <DatePickerInput />
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
          </DatePickerContent>
        </DatePicker>
        <FieldDescription>When the invoice is due.</FieldDescription>
        <div>
          <FieldError match="valueMissing">Choose a due date.</FieldError>
        </div>
      </Field>
      <button type="submit">Submit</button>
    </form>
  )
}

export { Example }

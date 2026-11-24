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
} from "@ui-sdk/solid/date-picker"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { useLog } from "../../../shared/solid/log"

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
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M8 2v3" />
                <path d="M16 2v3" />
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
              </svg>
            </DatePickerTrigger>
          </div>
          <DatePickerContent>
            <div data-slot="row">
              <CalendarPrevious data-variant="ghost">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m15 18-6-6 6-6" />
                </svg>
              </CalendarPrevious>
              <CalendarHeading />
              <CalendarNext data-variant="ghost">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2"
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  aria-hidden="true"
                >
                  <path d="m9 18 6-6-6-6" />
                </svg>
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

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
import { createSignal, Show } from "solid-js"
import type { DatePickerValue } from "@ui-sdk/solid/date-picker"

function Example() {
  const [value, setValue] = createSignal<DatePickerValue>(null)
  const [asking, setAsking] = createSignal(false)
  return (
    <DatePicker
      mode="range"
      defaultMonth="2026-10"
      value={value()}
      onValueChange={(next) => {
        setValue(next)
        setAsking(false)
      }}
      onOpenChange={(open) => open && setAsking(false)}
      dismissible={value() !== null}
      onDismissAttempt={() => setAsking(true)}
    >
      <div data-slot="row">
        <DatePickerInput aria-label="Check in" placeholder="Check in" />
        <span data-slot="hint">–</span>
        <DatePickerInput end aria-label="Check out" placeholder="Check out" />
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
        <Show when={asking()}>
          <p data-slot="hint" role="alert">
            Pick a check-out date to finish your stay.
          </p>
        </Show>
      </DatePickerContent>
    </DatePicker>
  )
}

export { Example }

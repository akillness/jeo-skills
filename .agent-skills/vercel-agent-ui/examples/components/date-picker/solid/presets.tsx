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
  DatePickerPreset,
  DatePickerTrigger,
} from "@ui-sdk/solid/date-picker"

function Example() {
  return (
    <DatePicker mode="range" today="2026-10-16">
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
        <div data-slot="row">
          <DatePickerPreset
            data-variant="ghost"
            value={["2026-10-10", "2026-10-16"]}
          >
            Last 7 Days
          </DatePickerPreset>
          <DatePickerPreset
            data-variant="ghost"
            value={["2026-09-17", "2026-10-16"]}
          >
            Last 30 Days
          </DatePickerPreset>
          <DatePickerPreset
            data-variant="ghost"
            value={["2026-10-01", "2026-10-31"]}
          >
            This Month
          </DatePickerPreset>
        </div>
      </DatePickerContent>
    </DatePicker>
  )
}

export { Example }

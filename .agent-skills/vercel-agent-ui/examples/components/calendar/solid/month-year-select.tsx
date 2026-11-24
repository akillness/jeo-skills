import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarMonthSelect,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
} from "@ui-sdk/solid/calendar"

function Example() {
  return (
    <Calendar defaultMonth="1990-06" min="1920-01-01" max="2026-10-16">
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
        <div data-slot="row">
          <CalendarMonthSelect />
          <CalendarYearSelect />
        </div>
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
    </Calendar>
  )
}

export { Example }

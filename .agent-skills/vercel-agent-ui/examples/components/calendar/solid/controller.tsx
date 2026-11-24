import { todayDate } from "@ui-sdk/core/date"
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
  createCalendarController,
} from "@ui-sdk/solid/calendar"

function Example() {
  const calendar = createCalendarController()
  const select = (date: string) => {
    calendar.setValue(date)
    calendar.focus(date)
  }
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => select("2026-12-25")}>
          Go to Christmas
        </button>
        <button type="button" onClick={() => select(todayDate())}>
          Today
        </button>
      </div>
      <Calendar
        controller={calendar}
        defaultValue="2026-10-16"
        defaultMonth="2026-10"
      >
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
      </Calendar>
    </div>
  )
}

export { Example }

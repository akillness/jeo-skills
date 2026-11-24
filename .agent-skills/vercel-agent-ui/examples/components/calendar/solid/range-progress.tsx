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
} from "@ui-sdk/solid/calendar"
import { useLog } from "../../../shared/solid/log"

function Example() {
  const log = useLog()
  return (
    <div>
      <Calendar
        mode="range"
        onAnchorChange={(anchor) =>
          log(anchor ? `Started on ${anchor}` : "Range finished")
        }
        onFocusedChange={(focused) => log(`Focus on ${focused}`)}
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

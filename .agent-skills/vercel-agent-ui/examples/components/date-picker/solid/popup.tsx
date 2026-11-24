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
} from "@ui-sdk/solid/date-picker"
import { useLog } from "../../../shared/solid/log"
import { createSignal } from "solid-js"

function Example() {
  const log = useLog()
  const [anchor, setAnchor] = createSignal<HTMLElement | null>(null)
  const [container, setContainer] = createSignal<HTMLElement | null>(null)
  return (
    <div data-slot="stack">
      <DatePicker
        defaultOpen={false}
        presentation="auto"
        container={container()}
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
        <DatePickerHint />
        <DatePickerContent
          anchor={anchor()}
          sideOffset={6}
          collisionPadding={16}
          keepMounted
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
        </DatePickerContent>
      </DatePicker>
      <div ref={setContainer} />
    </div>
  )
}

export { Example }

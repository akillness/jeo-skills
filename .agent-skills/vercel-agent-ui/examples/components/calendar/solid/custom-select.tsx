import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "@ui-sdk/solid/calendar"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { createSignal, For } from "solid-js"

const months = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
].map((label, index) => ({ value: String(index + 1).padStart(2, "0"), label }))
const years = ["2024", "2025", "2026", "2027", "2028"].map((year) => ({
  value: year,
  label: year,
}))

function Example() {
  const [month, setMonth] = createSignal("2026-10")
  const year = () => month().split("-")[0]
  const monthOfYear = () => month().split("-")[1]

  return (
    <Calendar
      month={month()}
      onMonthChange={setMonth}
      defaultValue="2026-10-16"
      min="2024-01-01"
      max="2028-12-31"
    >
      <div data-slot="row">
        <CalendarHeading />
        <Select
          items={months}
          value={monthOfYear()}
          onValueChange={(next) => next && setMonth(`${year()}-${next}`)}
        >
          <SelectTrigger aria-label="Month">
            <SelectValue />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectTrigger>
          <SelectContent>
            <For each={months}>
              {(option) => (
                <SelectItem value={option.value}>
                  {option.label}
                  <SelectItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </SelectItemIndicator>
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
        <Select
          items={years}
          value={year()}
          onValueChange={(next) => next && setMonth(`${next}-${monthOfYear()}`)}
        >
          <SelectTrigger aria-label="Year">
            <SelectValue />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectTrigger>
          <SelectContent>
            <For each={years}>
              {(option) => (
                <SelectItem value={option.value}>
                  {option.label}
                  <SelectItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </SelectItemIndicator>
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
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

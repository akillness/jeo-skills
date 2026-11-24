import * as React from "react"
import {
  addMonths,
  addYears,
  daysInMonth,
  endOfMonth,
  endOfWeek,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "@ui-sdk/core/date"

function Example() {
  const [date, setDate] = React.useState("2026-01-31")
  const [weekStartsOn, setWeekStartsOn] = React.useState(1)
  const [year, month] = date.split("-").map(Number)
  const week = {
    start: startOfWeek(date, weekStartsOn),
    end: endOfWeek(date, weekStartsOn),
  }
  const steps: [string, string, () => string][] = [
    ["month-back", "− Month", () => addMonths(date, -1)],
    ["month", "+ Month", () => addMonths(date, 1)],
    ["year", "+ Year", () => addYears(date, 1)],
  ]
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        {steps.map(([value, text, next]) => (
          <button
            key={value}
            type="button"
            data-size="sm"
            onClick={() => setDate(next())}
          >
            {text}
          </button>
        ))}
        <button
          type="button"
          data-size="sm"
          onClick={() => setDate("2026-01-31")}
        >
          Reset
        </button>
        <select
          aria-label="Weeks start on"
          value={weekStartsOn}
          onChange={(event) => setWeekStartsOn(Number(event.target.value))}
        >
          <option value={0}>Weeks start on Sunday</option>
          <option value={1}>Weeks start on Monday</option>
          <option value={6}>Weeks start on Saturday</option>
        </select>
      </div>
      <p data-date data-slot="date-value">
        {date}
      </p>
      <dl>
        <dt>Week</dt>
        <dd data-this-week>
          {week.start} to {week.end}
          {!isSameMonth(week.start, week.end) && ", across two months"}
        </dd>
        <dt>Month</dt>
        <dd data-this-month>
          {startOfMonth(date)} to {endOfMonth(date)}, {daysInMonth(year, month)}{" "}
          days
        </dd>
      </dl>
    </div>
  )
}

export { Example }

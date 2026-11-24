import * as React from "react"
import { formatDate, isSameMonth, monthGrid } from "@ui-sdk/core/date"

const months = ["2026-02-01", "2026-03-01", "2026-08-01"]

function Example() {
  const [fixedWeeks, setFixedWeeks] = React.useState(true)
  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <input
            type="checkbox"
            checked={fixedWeeks}
            onChange={(event) => setFixedWeeks(event.target.checked)}
          />
          Six weeks each
        </label>
      </div>
      <div data-slot="month-sizes-row">
        {months.map((month) => (
          <div key={month} data-month={month} data-slot="month-sizes-month">
            <p>
              {formatDate(month, "en-US", { month: "long", year: "numeric" })}
            </p>
            {monthGrid(month, { fixedWeeks }).map((week) => (
              <div key={week[0]} data-week data-slot="month-sizes-week">
                {week.map((day) => (
                  <span
                    key={day}
                    data-outside={isSameMonth(day, month) ? undefined : ""}
                  >
                    {Number(day.slice(8))}
                  </span>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

export { Example }

import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
} from "@ui-sdk/react/calendar"
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react"

function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4))
  const days = (day.getTime() - firstThursday.getTime()) / 86400000
  return 1 + Math.round((days - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

export function Example() {
  return (
    <Calendar defaultValue="2026-10-16" weekStartsOn={1}>
      <div data-slot="row">
        <CalendarPrevious
          data-variant="ghost"
          render={(props, step) => (
            <button {...props} title={`Show ${step.month}`} />
          )}
        >
          <ChevronLeftIcon />
        </CalendarPrevious>
        <CalendarHeading>{(heading) => heading.label}</CalendarHeading>
        <CalendarNext data-variant="ghost">
          <ChevronRightIcon />
        </CalendarNext>
      </div>
      <CalendarGrid>
        {(grid) => (
          <>
            <thead>
              <tr>
                <th scope="col">
                  <abbr title="Week">Wk</abbr>
                </th>
                {grid.weekdays.map((weekday, index) => (
                  <CalendarWeekday key={weekday} index={index} />
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.weeks.map((week) => (
                <tr key={week[0]!.date}>
                  <th scope="row" data-slot="hint">
                    {isoWeek(week[0]!.date)}
                  </th>
                  {week.map((cell) =>
                    cell.hidden ? (
                      <td key={cell.date} />
                    ) : (
                      <CalendarDay key={cell.date} value={cell.date} />
                    )
                  )}
                </tr>
              ))}
            </tbody>
          </>
        )}
      </CalendarGrid>
    </Calendar>
  )
}

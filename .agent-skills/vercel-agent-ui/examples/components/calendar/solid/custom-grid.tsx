import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarHeading,
  CalendarNext,
  CalendarPrevious,
  CalendarWeekday,
} from "@ui-sdk/solid/calendar"
import { For, Show } from "solid-js"

function isoWeek(date: string) {
  const day = new Date(`${date}T00:00:00Z`)
  day.setUTCDate(day.getUTCDate() + 3 - ((day.getUTCDay() + 6) % 7))
  const firstThursday = new Date(Date.UTC(day.getUTCFullYear(), 0, 4))
  const days = (day.getTime() - firstThursday.getTime()) / 86400000
  return 1 + Math.round((days - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7)
}

function Example() {
  return (
    <Calendar defaultValue="2026-10-16" weekStartsOn={1}>
      <div data-slot="row">
        <CalendarPrevious
          data-variant="ghost"
          render={(props, step) => (
            <button {...props} title={`Show ${step.month}`} />
          )}
        >
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
        <CalendarHeading>{(heading) => heading.label}</CalendarHeading>
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
        {(grid) => (
          <>
            <thead>
              <tr>
                <th scope="col">
                  <abbr title="Week">Wk</abbr>
                </th>
                <For each={grid.weekdays}>
                  {(_, index) => <CalendarWeekday index={index()} />}
                </For>
              </tr>
            </thead>
            <tbody>
              <For each={grid.weeks} keyed={(week) => week[0]!.date}>
                {(week) => (
                  <tr>
                    <th scope="row" data-slot="hint">
                      {isoWeek(week()[0]!.date)}
                    </th>
                    <For each={week()} keyed={(cell) => cell.date}>
                      {(cell) => (
                        <Show when={!cell().hidden} fallback={<td />}>
                          <CalendarDay value={cell().date} />
                        </Show>
                      )}
                    </For>
                  </tr>
                )}
              </For>
            </tbody>
          </>
        )}
      </CalendarGrid>
    </Calendar>
  )
}

export { Example }

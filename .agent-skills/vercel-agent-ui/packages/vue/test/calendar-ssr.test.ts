// @vitest-environment node
import { renderToString } from "@vue/server-renderer"
import { describe, expect, test } from "vitest"
import { createSSRApp, h } from "vue"
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarMonthSelect,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
  CalendarYearSelect,
  type CalendarDayState,
  type CalendarGridCell,
  type CalendarWeekdayState,
} from "../src/calendar"

const render = (props: Record<string, unknown>, content?: () => unknown) =>
  renderToString(createSSRApp(() => h(Calendar, props, content)))

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a calendar", () => {
  test("renders the month with one tab stop on the selection, and no today", async () => {
    const html = await render({ defaultValue: "2026-10-16" })
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="grid"')
    expect(html).toContain("October 2026")
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/tabindex="0"[^>]*data-value="2026-10-16"/)
    expect(html).not.toContain('aria-current="date"')
  })

  test("two months render two grids under one heading", async () => {
    const html = await render({ months: 2, defaultMonth: "2026-10" })
    expect(html.match(/role="grid"/g)).toHaveLength(2)
    expect(html).toMatch(/October\s–\sNovember 2026/)
  })

  test("scoped slots render each weekday and day with custom content", async () => {
    const html = await render({ defaultMonth: "2026-10" }, () =>
      h(CalendarGrid, () => [
        h(CalendarWeekdays, null, {
          default: ({ index }: { index: number }) =>
            h(
              CalendarWeekday,
              { index, class: "weekday" },
              {
                default: ({ state }: { state: CalendarWeekdayState }) =>
                  state.name.slice(0, 2),
              }
            ),
        }),
        h(CalendarWeeks, null, {
          default: ({ cell }: { cell: CalendarGridCell }) =>
            h(
              CalendarDay,
              { value: cell.date, class: "day" },
              {
                default: ({ state }: { state: CalendarDayState }) =>
                  `[${state.date.slice(8)}]`,
              }
            ),
        }),
      ])
    )
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*class="weekday"[^>]*>Su</)
    expect(html).toMatch(
      /<td[^>]*class="day"[^>]*data-value="2026-10-16"[^>]*>\[16\]</
    )
  })

  test("the month and year selects render their options with the month shown selected", async () => {
    const html = await render(
      { defaultMonth: "2026-10", min: "2024-03-10", max: "2026-11-02" },
      () => [h(CalendarMonthSelect), h(CalendarYearSelect)]
    )
    expect(html).toMatch(/<select[^>]*aria-label="Month"/)
    expect(html).not.toMatch(/<select[^>]*value=/)
    expect(html).toMatch(/<option value="10" selected>October<\/option>/)
    expect(html).toMatch(/<option value="12" disabled>December<\/option>/)
    expect(html.match(/<option value="20\d\d"/g)).toHaveLength(3)
    expect(html).toMatch(/<option value="2026" selected>2026<\/option>/)
  })
})

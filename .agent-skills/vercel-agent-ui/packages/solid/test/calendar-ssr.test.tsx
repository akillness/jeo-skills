import { renderToString } from "@solidjs/web"
import { describe, expect, test } from "vitest"
import {
  Calendar,
  CalendarDay,
  CalendarGrid,
  CalendarWeekday,
  CalendarWeekdays,
  CalendarWeeks,
} from "../src/calendar"

// Runs with no DOM: any access to window or document during render throws.
describe("server rendering a calendar", () => {
  test("renders the month with one tab stop on the selection, and no today", () => {
    const html = renderToString(() => <Calendar defaultValue="2026-10-16" />)
    expect(typeof window).toBe("undefined")
    expect(html).toContain('role="grid"')
    expect(html).toContain("October 2026")
    expect(html.match(/tabindex="0"/g)).toHaveLength(1)
    expect(html).toMatch(/tabindex="0"[^>]*data-value="2026-10-16"/)
    expect(html).not.toContain('aria-current="date"')
  })

  test("two months render two grids under one heading", () => {
    const html = renderToString(() => (
      <Calendar months={2} defaultMonth="2026-10" />
    ))
    expect(html.match(/role="grid"/g)).toHaveLength(2)
    expect(html).toMatch(/October\s–\sNovember 2026/)
  })

  test("weekdays and weeks render each header and day through their function children", () => {
    const html = renderToString(() => (
      <Calendar defaultMonth="2026-10" showOutsideDays={false}>
        <CalendarGrid>
          <CalendarWeekdays>
            {(index) => <CalendarWeekday index={index} class="weekday" />}
          </CalendarWeekdays>
          <CalendarWeeks>
            {(cell) => (
              <CalendarDay value={cell.date} class="day">
                {(state) => `day ${state.label}`}
              </CalendarDay>
            )}
          </CalendarWeeks>
        </CalendarGrid>
      </Calendar>
    ))
    expect(html.match(/class="weekday"/g)).toHaveLength(7)
    expect(html.match(/class="day"/g)).toHaveLength(31)
    expect(html).toContain(">day 31<")
    // October 2026 starts on a Thursday, so four empty cells come first.
    expect(html.match(/<td><\/td>/g)).toHaveLength(4)
  })
})

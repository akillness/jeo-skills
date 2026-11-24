import { todayDate } from "@ui-sdk/core/date"
import { createCalendarController } from "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="christmas">Go to Christmas</button>
        <button type="button" data-action="today">Today</button>
      </div>
      <ui-calendar default-value="2026-10-16" default-month="2026-10">
        <div data-slot="row">
          <ui-calendar-previous>
            <button data-variant="ghost">
              ${createElement(ChevronLeft, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-calendar-previous>
          <ui-calendar-heading></ui-calendar-heading>
          <ui-calendar-next>
            <button data-variant="ghost">
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-calendar-next>
        </div>
        <ui-calendar-grid>
          <ui-calendar-weekdays>
            <template><ui-calendar-weekday></ui-calendar-weekday></template>
          </ui-calendar-weekdays>
          <ui-calendar-weeks>
            <template><ui-calendar-day></ui-calendar-day></template>
          </ui-calendar-weeks>
        </ui-calendar-grid>
      </ui-calendar>
    </div>
  `
  const calendar = createCalendarController()
  root.querySelector("ui-calendar")!.controller = calendar
  const select = (date: string) => {
    calendar.setValue(date)
    calendar.focus(date)
  }
  root
    .querySelector('[data-action="christmas"]')!
    .addEventListener("click", () => select("2026-12-25"))
  root
    .querySelector('[data-action="today"]')!
    .addEventListener("click", () => select(todayDate()))
}

export { mount }

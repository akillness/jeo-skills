import { addDays, endOfMonth, startOfMonth } from "@ui-sdk/core/date"
import { createCalendarController } from "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

const today = "2026-10-16"
const presets = [
  { label: "Last 7 Days", range: [addDays(today, -6), today] },
  { label: "This Month", range: [startOfMonth(today), endOfMonth(today)] },
  { label: "Next 30 Days", range: [today, addDays(today, 29)] },
] as const

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${presets
          .map(
            (preset, index) =>
              `<button type="button" data-size="sm" data-preset="${index}">${preset.label}</button>`
          )
          .join("")}
      </div>
      <ui-calendar mode="range" today="${today}" default-month="2026-10">
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
  for (const button of root.querySelectorAll<HTMLElement>("[data-preset]")) {
    const { range } = presets[Number(button.dataset.preset)]!
    button.addEventListener("click", () => {
      calendar.setValue([...range])
      calendar.focus(range[0])
    })
  }
}

export { mount }

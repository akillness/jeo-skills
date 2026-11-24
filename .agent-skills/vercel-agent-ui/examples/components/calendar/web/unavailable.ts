import "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

const unavailable = [
  "2026-10-08",
  { from: "2026-10-20", to: "2026-10-23" },
  { weekday: [0, 6] },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-calendar>
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
  `
  root.querySelector("ui-calendar")!.unavailable = unavailable
}

export { mount }

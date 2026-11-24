import "@ui-sdk/web/date-picker"
import { Calendar, ChevronLeft, ChevronRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-date-picker mode="range" today="2026-10-16">
      <div data-slot="row">
        <ui-date-picker-input><input aria-label="Check in" placeholder="Check in" /></ui-date-picker-input>
        <span data-slot="hint">–</span>
        <ui-date-picker-input end><input aria-label="Check out" placeholder="Check out" /></ui-date-picker-input>
        <ui-date-picker-trigger>
          <button data-variant="ghost">
            ${createElement(Calendar, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-date-picker-trigger>
      </div>
      <ui-date-picker-content hidden>
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
        <div data-slot="row">
          <ui-date-picker-preset value="2026-10-10,2026-10-16"><button data-variant="ghost">Last 7 Days</button></ui-date-picker-preset>
          <ui-date-picker-preset value="2026-09-17,2026-10-16"><button data-variant="ghost">Last 30 Days</button></ui-date-picker-preset>
          <ui-date-picker-preset value="2026-10-01,2026-10-31"><button data-variant="ghost">This Month</button></ui-date-picker-preset>
        </div>
      </ui-date-picker-content>
    </ui-date-picker>
  `
}

export { mount }

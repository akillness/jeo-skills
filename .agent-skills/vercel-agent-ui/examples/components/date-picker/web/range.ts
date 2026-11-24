import "@ui-sdk/web/date-picker"
import { Calendar, ChevronLeft, ChevronRight, createElement } from "lucide"

let count = 0

function mount(root: HTMLElement) {
  const id = `date-picker-range-${++count}`
  root.innerHTML = `
    <ui-date-picker mode="range" months="2" month-format="short" default-value="2026-10-12,2026-10-16">
      <div data-slot="row" id="${id}-field">
        <ui-date-picker-input><input aria-label="Check in" placeholder="Check in" /></ui-date-picker-input>
        <span data-slot="hint">–</span>
        <ui-date-picker-input end><input aria-label="Check out" placeholder="Check out" /></ui-date-picker-input>
        <ui-date-picker-trigger>
          <button data-variant="ghost">
            ${createElement(Calendar, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-date-picker-trigger>
      </div>
      <ui-date-picker-content hidden anchor="#${id}-field" align="center">
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
        <div data-slot="row">
          <ui-calendar-grid>
            <ui-calendar-weekdays>
              <template><ui-calendar-weekday></ui-calendar-weekday></template>
            </ui-calendar-weekdays>
            <ui-calendar-weeks>
              <template><ui-calendar-day></ui-calendar-day></template>
            </ui-calendar-weeks>
          </ui-calendar-grid>
          <ui-calendar-grid offset="1">
            <ui-calendar-weekdays>
              <template><ui-calendar-weekday></ui-calendar-weekday></template>
            </ui-calendar-weekdays>
            <ui-calendar-weeks>
              <template><ui-calendar-day></ui-calendar-day></template>
            </ui-calendar-weeks>
          </ui-calendar-grid>
        </div>
      </ui-date-picker-content>
    </ui-date-picker>
  `
}

export { mount }

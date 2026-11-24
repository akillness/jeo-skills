import "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-calendar months="2" page-by="page" month-format="short" default-value="2026-10-16">
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
        <ui-calendar-grid offset="0">
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
    </ui-calendar>
  `
}

export { mount }

import "@ui-sdk/web/date-picker"
import { Calendar, ChevronLeft, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

let count = 0

function mount(root: HTMLElement) {
  const id = `date-picker-popup-${++count}`
  root.innerHTML = `
    <div data-slot="stack">
      <ui-date-picker default-open="false" presentation="auto" container="#${id}-container">
        <div data-slot="row" id="${id}-anchor">
          <ui-date-picker-input><input aria-label="Due date" /></ui-date-picker-input>
          <ui-date-picker-trigger>
            <button data-variant="ghost">
              ${createElement(Calendar, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-date-picker-trigger>
        </div>
        <ui-date-picker-hint></ui-date-picker-hint>
        <ui-date-picker-content hidden anchor="#${id}-anchor" side-offset="6" collision-padding="16" keep-mounted>
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
        </ui-date-picker-content>
      </ui-date-picker>
      <div id="${id}-container"></div>
    </div>
  `
  const picker = root.querySelector("ui-date-picker")!
  picker.addEventListener("openchange", (event) => {
    log(
      root,
      `${event.detail.value ? "Opened" : "Closed"} (${event.detail.reason})`
    )
  })
  picker.addEventListener("openchangecomplete", (event) => {
    if (!event.detail.value) {
      log(root, "Finished closing")
    }
  })
  picker.addEventListener("monthchange", (event) => {
    log(root, `Showing ${event.detail.value} (${event.detail.reason})`)
  })
}

export { mount }

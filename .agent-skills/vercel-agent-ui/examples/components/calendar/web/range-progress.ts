import "@ui-sdk/web/calendar"
import { ChevronLeft, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div>
      <ui-calendar mode="range">
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
  const calendar = root.querySelector("ui-calendar")!
  calendar.addEventListener("anchorchange", (event) => {
    log(
      root,
      event.detail.value ? `Started on ${event.detail.value}` : "Range finished"
    )
  })
  calendar.addEventListener("focusedchange", (event) =>
    log(root, `Focus on ${event.detail.value}`)
  )
}

export { mount }

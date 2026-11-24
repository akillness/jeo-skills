import "@ui-sdk/web/date-picker"
import { Calendar, ChevronLeft, ChevronRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-date-picker mode="range" default-month="2026-10" dismissible="false">
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
        <p data-slot="hint" role="alert" hidden>Pick a check-out date to finish your stay.</p>
      </ui-date-picker-content>
    </ui-date-picker>
  `
  const picker = root.querySelector("ui-date-picker")!
  const alert = root.querySelector<HTMLElement>('[role="alert"]')!
  picker.addEventListener("valuechange", (event) => {
    alert.hidden = true
    if (event.detail.value === null) {
      picker.setAttribute("dismissible", "false")
    } else {
      picker.removeAttribute("dismissible")
    }
  })
  picker.addEventListener("dismissattempt", () => (alert.hidden = false))
  picker.addEventListener("openchange", (event) => {
    if (event.detail.value) {
      alert.hidden = true
    }
  })
}

export { mount }

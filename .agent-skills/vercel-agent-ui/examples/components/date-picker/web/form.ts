import "@ui-sdk/web/date-picker"
import "@ui-sdk/web/field"
import { Calendar, ChevronLeft, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field name="due">
        <ui-field-label>Due date</ui-field-label>
        <ui-date-picker required>
          <div data-slot="row">
            <ui-date-picker-input><input /></ui-date-picker-input>
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
          </ui-date-picker-content>
        </ui-date-picker>
        <ui-field-description>When the invoice is due.</ui-field-description>
        <div>
          <ui-field-error match="valueMissing">Choose a due date.</ui-field-error>
        </div>
      </ui-field>
      <button type="submit">Submit</button>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted due=${new FormData(form).get("due")}`)
  })
}

export { mount }

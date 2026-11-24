import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"
import "@ui-sdk/web/time-input"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-field-label>Date</ui-field-label>
        <ui-date-input name="date" default-value="2026-11-02" required></ui-date-input>
        <ui-field-error></ui-field-error>
      </ui-field>
      <ui-field>
        <ui-field-label>Time</ui-field-label>
        <ui-time-input name="time" default-value="09:30" required></ui-time-input>
        <ui-field-error></ui-field-error>
      </ui-field>
      <div data-slot="row">
        <button type="reset">Reset</button>
        <button type="submit" data-variant="solid">Book</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const data = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${data.join(", ")}`)
  })
}

export { mount }

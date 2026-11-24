import "@ui-sdk/web/date-input"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Clear</button>
      </div>
      <ui-field>
        <ui-field-label>Due date</ui-field-label>
        <ui-date-input default-value="2026-11-02"></ui-date-input>
      </ui-field>
    </div>
  `
  const input = root.querySelector("ui-date-input")!
  input.addEventListener("valuechange", (event) => {
    log(root, `Due date ${event.detail.value ?? "empty"}`)
  })
  root.querySelector("button")!.addEventListener("click", () => {
    input.value = null
  })
}

export { mount }

import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-value="4">Reset to 4</button>
        <button type="button" data-value="">Clear</button>
      </div>
      <ui-field>
        <ui-field-label>Servings</ui-field-label>
        <ui-number-input default-value="4" min="1" max="12">
          <ui-number-input-group>
            <ui-number-input-decrement>
              <button aria-label="Decrease">
                ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-number-input-decrement>
            <ui-number-input-control>
              <input />
            </ui-number-input-control>
            <ui-number-input-increment>
              <button aria-label="Increase">
                ${createElement(Plus, { "aria-hidden": "true" }).outerHTML}
              </button>
            </ui-number-input-increment>
          </ui-number-input-group>
        </ui-number-input>
      </ui-field>
    </div>
  `
  const field = root.querySelector("ui-number-input")!
  field.addEventListener("valuechange", (event) => {
    log(root, `Value ${event.detail.value ?? "empty"} (${event.detail.reason})`)
  })
  field.addEventListener("valuecommit", (event) => {
    log(
      root,
      `Committed ${event.detail.value ?? "empty"} (${event.detail.reason})`
    )
  })
  root.querySelectorAll<HTMLButtonElement>("[data-value]").forEach((button) => {
    button.addEventListener("click", () => {
      field.value = button.dataset.value ? Number(button.dataset.value) : null
    })
  })
}

export { mount }

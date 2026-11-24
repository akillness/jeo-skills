import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="out">Zoom Out</button>
        <button type="button" data-action="in">Zoom In</button>
        <button type="button" data-action="reset">Actual Size</button>
        <button type="button" data-action="read">Read</button>
        <button type="button" data-action="focus">Focus</button>
      </div>
      <ui-field>
        <ui-field-label>Zoom</ui-field-label>
        <ui-number-input default-value="100" min="10" max="400" step="10">
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
  field.format = { style: "unit", unit: "percent" }
  field.addEventListener("valuechange", (event) => {
    log(root, `Zoom ${event.detail.value ?? "empty"}% (${event.detail.reason})`)
  })
  const zoom = field.api
  const actions: Record<string, () => void> = {
    out: () => zoom.decrement({ large: true }),
    in: () => zoom.increment({ large: true }),
    reset: () => zoom.setValue(100),
    read: () => log(root, `Zoom is ${zoom.getValue()}%`),
    focus: () => zoom.focus(),
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
}

export { mount }

import "@ui-sdk/web/number-input"
import "@ui-sdk/web/field"
import { createElement, Minus, Plus } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Temperature</ui-field-label>
      <ui-number-input default-value="-2" min="-20" max="40">
        <ui-number-input-group>
          <ui-number-input-decrement>
            <button aria-label="Colder">
              ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-number-input-decrement>
          <ui-number-input-control>
            <input />
          </ui-number-input-control>
          <ui-number-input-increment>
            <button aria-label="Warmer"></button>
          </ui-number-input-increment>
        </ui-number-input-group>
      </ui-number-input>
    </ui-field>
  `
  const field = root.querySelector("ui-number-input")!
  field.format = { style: "unit", unit: "celsius" }
  const colder = root.querySelector<HTMLButtonElement>('[aria-label="Colder"]')!
  const warmer = root.querySelector<HTMLButtonElement>('[aria-label="Warmer"]')!
  const plus = createElement(Plus, { "aria-hidden": "true" }).outerHTML
  const show = (value: number | null) => {
    colder.title = value === -20 ? "As cold as it goes" : "Colder"
    warmer.innerHTML = value === 40 ? "<span>Max</span>" : plus
  }
  field.addEventListener("valuechange", (event) => show(event.detail.value))
  show(field.value)
}

export { mount }

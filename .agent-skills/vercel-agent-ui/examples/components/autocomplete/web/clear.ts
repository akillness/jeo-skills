import "@ui-sdk/web/autocomplete"
import { ChevronDown, createElement, X } from "lucide"

const fruits = [
  "Apple",
  "Apricot",
  "Avocado",
  "Banana",
  "Blackberry",
  "Blueberry",
  "Cherry",
  "Grape",
  "Lemon",
  "Mango",
  "Orange",
  "Peach",
  "Pear",
  "Pineapple",
  "Strawberry",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-autocomplete default-value="Mango">
      <div data-slot="stack">
        <ui-autocomplete-label>Fruit</ui-autocomplete-label>
        <div data-slot="row">
          <ui-autocomplete-input>
            <input />
          </ui-autocomplete-input>
          <ui-autocomplete-clear>
            <button aria-label="Clear">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-autocomplete-clear>
          <ui-autocomplete-trigger>
            <button aria-label="Show fruits">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-autocomplete-trigger>
        </div>
      </div>
      <ui-autocomplete-content hidden>
        <ui-autocomplete-empty>No fruits found.</ui-autocomplete-empty>
        <ui-autocomplete-list>
          ${fruits.map((fruit) => `<ui-autocomplete-item value="${fruit}">${fruit}</ui-autocomplete-item>`).join("")}
        </ui-autocomplete-list>
      </ui-autocomplete-content>
    </ui-autocomplete>
  `
}

export { mount }

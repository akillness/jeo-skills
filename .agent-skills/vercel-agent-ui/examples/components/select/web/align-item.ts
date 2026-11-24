import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const priorities = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox default-checked>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Align item with trigger
        </label>
      </div>
      <ui-field>
        <ui-field-label>Priority</ui-field-label>
        <ui-select default-value="medium">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content align-item-with-trigger>
            ${priorities
              .map(
                (priority) => `
                  <ui-select-item value="${priority.value}">
                    ${priority.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
    </div>
  `
  const content = root.querySelector("ui-select-content")!
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      content.toggleAttribute(
        "align-item-with-trigger",
        event.detail.value === true
      )
    })
}

export { mount }

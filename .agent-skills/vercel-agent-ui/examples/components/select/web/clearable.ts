import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement, X } from "lucide"
import { log } from "../../../shared/web/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Assignee</ui-field-label>
      <ui-select default-value="ines" placeholder="Unassigned">
        <div data-slot="row">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-clear>
            <button aria-label="Clear assignee">${createElement(X, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-select-clear>
        </div>
        <ui-select-content>
          ${people
            .map(
              (person) => `
                <ui-select-item value="${person.value}">
                  ${person.label}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    log(
      root,
      `value: ${JSON.stringify(event.detail.value)} (${event.detail.reason})`
    )
  })
}

export { mount }

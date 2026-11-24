import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const modes = [
  { value: "pointer", label: "Pointer" },
  { value: "true", label: "Modal" },
  { value: "false", label: "Non-modal" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls" role="group" aria-label="Modal">
        ${modes
          .map(
            (mode) => `
              <button type="button" data-mode="${mode.value}" aria-pressed="${mode.value === "pointer"}">${mode.label}</button>
            `
          )
          .join("")}
      </div>
      <ui-field>
        <ui-field-label>Status</ui-field-label>
        <ui-select modal="pointer" default-value="todo">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${statuses
              .map(
                (status) => `
                  <ui-select-item value="${status.value}">
                    ${status.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
      <button type="button" data-action="save">Save Draft</button>
    </div>
  `
  const select = root.querySelector("ui-select")!
  const buttons = root.querySelectorAll<HTMLButtonElement>("[data-mode]")
  for (const button of buttons) {
    button.addEventListener("click", () => {
      select.setAttribute("modal", button.dataset.mode!)
      for (const other of buttons) {
        other.setAttribute("aria-pressed", String(other === button))
      }
    })
  }
  root
    .querySelector("[data-action=save]")!
    .addEventListener("click", () => log(root, "Pressed Save Draft"))
}

export { mount }

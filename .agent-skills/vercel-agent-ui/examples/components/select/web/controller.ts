import "@ui-sdk/web/field"
import { createSelectController } from "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const status = createSelectController<string>()

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="open">Open and Wait</button>
        <button type="button" data-action="done">Mark Done</button>
        <button type="button" data-action="clear">Clear</button>
        <button type="button" data-action="focus">Focus</button>
      </div>
      <ui-field>
        <ui-field-label>Status</ui-field-label>
        <ui-select-trigger for="select-controller">
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
      </ui-field>
      <ui-select id="select-controller" placeholder="Select a status">
        <ui-select-content>
          ${statuses
            .map(
              (item) => `
                <ui-select-item value="${item.value}">
                  ${item.label}
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </div>
  `
  const select = root.querySelector("ui-select")!
  select.controller = status
  select.items = statuses
  const actions: Record<string, () => void> = {
    open: async () => {
      const { reason } = await status.open()
      log(root, `Closed by ${reason}, with ${status.getValue() ?? "nothing"}`)
    },
    done: () => status.setValue("done"),
    clear: () => status.clear(),
    focus: () => status.focus(),
  }
  for (const button of root.querySelectorAll<HTMLElement>("[data-action]")) {
    button.addEventListener("click", () => actions[button.dataset.action!]())
  }
}

export { mount }

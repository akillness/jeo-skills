import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"

const tasks = [
  { label: "Write the release notes", done: false },
  { label: "Update the changelog", done: true },
  { label: "Tag the release", done: false },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      ${tasks
        .map(
          (task) => `
            <label data-slot="label">
              <ui-checkbox${task.done ? " default-checked" : ""}>
                <ui-checkbox-indicator>
                  ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                </ui-checkbox-indicator>
              </ui-checkbox>
              ${task.label}
            </label>
          `
        )
        .join("")}
    </div>
  `
}

export { mount }

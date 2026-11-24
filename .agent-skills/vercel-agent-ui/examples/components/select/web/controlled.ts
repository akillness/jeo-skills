import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="editor">Make Editor</button>
        <button type="button" data-action="open">Open</button>
      </div>
      <ui-field>
        <ui-field-label>Role</ui-field-label>
        <ui-select default-value="viewer">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${roles
              .map(
                (role) => `
                  <ui-select-item value="${role.value}">
                    ${role.label}
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
  const select = root.querySelector("ui-select")!
  select.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    if (value === "owner") {
      event.preventDefault()
      log(root, "Only the owner can transfer ownership")
      return
    }
    log(root, `value: ${value} (${reason})`)
  })
  select.addEventListener("openchange", (event) => {
    log(root, `open: ${event.detail.value} (${event.detail.reason})`)
  })
  root
    .querySelector("[data-action=editor]")!
    .addEventListener("click", () => (select.value = "editor"))
  root
    .querySelector("[data-action=open]")!
    .addEventListener("click", () => (select.open = true))
}

export { mount }

import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/dialog"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const topics = [
  { label: "Product updates", checked: true },
  { label: "Security alerts", checked: true },
  { label: "Weekly digest", checked: false },
]

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${check}</ui-checkbox-indicator>
          </ui-checkbox>
          Open
        </label>
      </div>
      <ui-dialog>
        <ui-dialog-trigger>
          <button>Notification Settings</button>
        </ui-dialog-trigger>
        <ui-dialog-backdrop hidden></ui-dialog-backdrop>
        <ui-dialog-content hidden>
          <div data-slot="stack">
            <ui-dialog-title>Notification settings</ui-dialog-title>
            <ui-dialog-description>Choose what we email you about.</ui-dialog-description>
          </div>
          <div data-slot="stack">
            ${topics
              .map(
                (topic) => `
                  <label data-slot="label">
                    <ui-checkbox${topic.checked ? " default-checked" : ""}>
                      <ui-checkbox-indicator>${check}</ui-checkbox-indicator>
                    </ui-checkbox>
                    ${topic.label}
                  </label>
                `
              )
              .join("")}
          </div>
          <div data-slot="row">
            <ui-dialog-close>
              <button data-variant="solid">Done</button>
            </ui-dialog-close>
          </div>
        </ui-dialog-content>
      </ui-dialog>
    </div>
  `
  const toggle = root.querySelector("ui-checkbox")!
  const dialog = root.querySelector("ui-dialog")!
  toggle.addEventListener("checkedchange", (event) => {
    dialog.open = event.detail.value === true
  })
  dialog.addEventListener("openchange", (event) => {
    const { value, reason } = event.detail
    toggle.checked = value
    log(root, `${value ? "Opened" : "Closed"} (${reason})`)
  })
  dialog.addEventListener("openchangecomplete", (event) => {
    log(root, event.detail.value ? "Finished opening" : "Finished closing")
  })
}

export { mount }

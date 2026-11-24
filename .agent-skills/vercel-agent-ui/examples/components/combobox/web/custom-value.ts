import "@ui-sdk/web/combobox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const titles = [
  "Designer",
  "Engineer",
  "Engineering manager",
  "Product manager",
  "Researcher",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox allow-custom-value>
      <div data-slot="stack">
        <ui-combobox-label>Job title</ui-combobox-label>
        <ui-combobox-input>
          <input placeholder="Type any title…" />
        </ui-combobox-input>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>Press Enter to use “<span></span>”.</ui-combobox-empty>
        <ui-combobox-list>
          ${titles
            .map(
              (title) => `
                <ui-combobox-item value="${title}">
                  ${title}
                  <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
  const combobox = root.querySelector("ui-combobox")!
  const query = root.querySelector("ui-combobox-empty span")!
  combobox.addEventListener(
    "querychange",
    (event) => (query.textContent = event.detail.value)
  )
  combobox.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    log(root, `${value ? `“${value}”` : "No title"} (${reason})`)
  })
}

export { mount }

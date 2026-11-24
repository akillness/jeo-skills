import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const countries = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
]

const topics = ["Design", "Engineering", "Marketing", "Research", "Sales"]

const frequencies = ["Daily", "Weekly", "Monthly"]

const item = (value: string, label: string) => `
  <ui-select-item value="${value}">
    ${label}
    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
  </ui-select-item>
`

const trigger = `
  <ui-select-trigger>
    <button>
      <ui-select-value></ui-select-value>
      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
    </button>
  </ui-select-trigger>
`

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <form id="select-newsletter" data-slot="stack">
        <ui-field>
          <ui-field-label>Country</ui-field-label>
          <ui-select name="country" auto-complete="country" required placeholder="Select a country">
            ${trigger}
            <ui-select-content>
              ${countries.map((country) => item(country.value, country.label)).join("")}
            </ui-select-content>
          </ui-select>
        </ui-field>
        <ui-field>
          <ui-field-label>Topics</ui-field-label>
          <ui-select name="topics" multiple default-value="Design">
            ${trigger}
            <ui-select-content>
              ${topics.map((topic) => item(topic, topic)).join("")}
            </ui-select-content>
          </ui-select>
        </ui-field>
      </form>
      <ui-field>
        <ui-field-label>Frequency</ui-field-label>
        <ui-select name="frequency" form="select-newsletter" default-value="Weekly">
          ${trigger}
          <ui-select-content>
            ${frequencies.map((frequency) => item(frequency, frequency)).join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
      <div data-slot="row">
        <button type="submit" form="select-newsletter" data-variant="solid">Save</button>
        <button type="reset" form="select-newsletter">Reset</button>
      </div>
    </div>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(root, `Submitted ${entries.join("&")}`)
  })
}

export { mount }

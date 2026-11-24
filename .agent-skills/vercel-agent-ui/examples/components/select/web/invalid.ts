import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const methods = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field name="shipping">
        <ui-field-label>Shipping method</ui-field-label>
        <ui-select required placeholder="Select a shipping method">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${methods
              .map(
                (method) => `
                  <ui-select-item value="${method.value}">
                    ${method.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
        <ui-field-description>Express arrives in two business days.</ui-field-description>
        <ui-field-error match="valueMissing">Choose a shipping method.</ui-field-error>
      </ui-field>
      <button type="submit" data-variant="solid">Continue</button>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted shipping=${new FormData(form).get("shipping")}`)
  })
}

export { mount }

import "@ui-sdk/web/field"
import "@ui-sdk/web/radio"
import { log } from "../../../shared/web/log"

const speeds = [
  { value: "standard", label: "Standard", detail: "Free, 5 to 7 days" },
  { value: "express", label: "Express", detail: "$9, 2 days" },
  { value: "overnight", label: "Overnight", detail: "$24, next day" },
]

function mount(root: HTMLElement) {
  const id = crypto.randomUUID()
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Shipping speed</ui-field-label>
        <ui-radio-group name="shipping" form="${id}-checkout" required default-value="standard">
          ${speeds
            .map(
              (speed) => `
                <label data-slot="label">
                  <ui-radio value="${speed.value}">
                    <ui-radio-indicator></ui-radio-indicator>
                  </ui-radio>
                  ${speed.label}
                  <span data-slot="hint">(${speed.detail})</span>
                </label>
              `
            )
            .join("")}
        </ui-radio-group>
      </ui-field>
      <form data-slot="row" id="${id}-checkout">
        <button type="submit" data-variant="solid">Continue</button>
        <button type="reset">Reset</button>
      </form>
    </div>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted shipping=${new FormData(form).get("shipping")}`)
  })
}

export { mount }

import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import { toText, type TokenInputValue } from "@ui-sdk/web/token-input"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

function mount(root: HTMLElement) {
  const formId = crypto.randomUUID()
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Disabled
        </label>
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-checkbox-indicator>
          </ui-checkbox>
          Read-only
        </label>
      </div>
      <div data-slot="stack">
        <ui-field>
          <ui-field-label>Prompt</ui-field-label>
          <ui-token-input form="${formId}" name="prompt" required value="${toText(draft)}">
            <ui-token-input-editor></ui-token-input-editor>
          </ui-token-input>
        </ui-field>
        <form id="${formId}" data-slot="row">
          <button type="submit" data-variant="solid">Submit</button>
          <button type="reset">Reset</button>
        </form>
      </div>
    </div>
  `
  const field = root.querySelector("ui-field")!
  const prompt = root.querySelector("ui-token-input")!
  const [disabled, readOnly] = root.querySelectorAll("ui-checkbox")
  disabled.addEventListener("checkedchange", (event) => {
    field.toggleAttribute("disabled", event.detail.value === true)
  })
  readOnly.addEventListener("checkedchange", (event) => {
    prompt.toggleAttribute("read-only", event.detail.value === true)
  })
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted ${new FormData(form).get("prompt") ?? ""}`)
  })
}

export { mount }

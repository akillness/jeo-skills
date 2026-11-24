import "@ui-sdk/web/switch"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <div data-slot="row">
          <div data-slot="stack">
            <ui-field-label>Two-factor authentication</ui-field-label>
            <ui-field-description>Required for admins of this workspace.</ui-field-description>
          </div>
          <ui-switch name="two-factor" required>
            <ui-switch-thumb></ui-switch-thumb>
          </ui-switch>
        </div>
        <ui-field-error match="valueMissing">Turn this on to continue.</ui-field-error>
      </ui-field>
      <div data-slot="row">
        <button type="submit" data-variant="solid">Continue</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Submitted two-factor=${new FormData(form).get("two-factor")}`)
  })
}

export { mount }

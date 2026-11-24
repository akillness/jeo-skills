import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/field"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <form data-slot="stack">
      <ui-field>
        <ui-checkbox name="terms" value="yes" required>
          <ui-checkbox-indicator>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-checkbox-indicator>
        </ui-checkbox>
        <div data-slot="stack">
          <ui-field-label>Accept terms and conditions</ui-field-label>
          <ui-field-description>You agree to our Terms of Service and Privacy Policy.</ui-field-description>
        </div>
      </ui-field>
      <ui-field>
        <ui-checkbox name="newsletter" value="weekly" default-checked>
          <ui-checkbox-indicator>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-checkbox-indicator>
        </ui-checkbox>
        <div data-slot="stack">
          <ui-field-label>Send me the weekly newsletter</ui-field-label>
          <ui-field-description>Product news and tips, once a week. Unsubscribe anytime.</ui-field-description>
        </div>
      </ui-field>
      <div data-slot="row">
        <button type="submit">Create Account</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    const entries = [...new FormData(form)].map(
      ([name, value]) => `${name}=${value}`
    )
    log(
      root,
      entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing"
    )
  })
}

export { mount }

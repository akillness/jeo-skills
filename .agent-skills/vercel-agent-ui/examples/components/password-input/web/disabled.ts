import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field disabled>
      <ui-field-label>Password</ui-field-label>
      <ui-password-input name="password" default-value="hunter22">
        <input />
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <ui-field-description>Your administrator manages this password.</ui-field-description>
    </ui-field>
  `
}

export { mount }

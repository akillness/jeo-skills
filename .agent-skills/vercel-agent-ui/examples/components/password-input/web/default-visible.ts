import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Wi-Fi password</ui-field-label>
      <ui-password-input name="wifi-password" default-visible default-value="maple-orbit-42">
        <input autocomplete="new-password" />
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <ui-field-description>Guests read it from here, so it starts shown.</ui-field-description>
    </ui-field>
  `
}

export { mount }

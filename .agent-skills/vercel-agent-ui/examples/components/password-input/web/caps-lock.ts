import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff, Lock } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Password</ui-field-label>
      <ui-password-input name="password">
        <input />
        ${createElement(Lock, { "aria-hidden": "true" }).outerHTML}
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <p data-slot="caps-lock">Caps Lock is on.</p>
    </ui-field>
  `
}

export { mount }

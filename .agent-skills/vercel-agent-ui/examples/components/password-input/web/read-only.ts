import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Recovery key</ui-field-label>
      <ui-password-input name="recovery-key" read-only default-value="7Hq2-vX9p-Lm4c">
        <input autocomplete="off" />
        <ui-password-input-toggle>
          <button aria-label="Show recovery key">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
      <ui-field-description>Keep it somewhere safe. You can show it, but not change it.</ui-field-description>
    </ui-field>
  `
}

export { mount }

import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Password</ui-field-label>
      <ui-password-input name="password">
        <input />
        <ui-password-input-toggle>
          <button aria-label="Show password">
            ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
            ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-password-input-toggle>
      </ui-password-input>
    </ui-field>
  `
  root
    .querySelector("ui-password-input")!
    .addEventListener("visiblechange", (event) => {
      const { value, reason } = event.detail
      log(root, `${value ? "Shown" : "Hidden"} (${reason})`)
    })
}

export { mount }

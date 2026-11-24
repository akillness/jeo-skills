import "@ui-sdk/web/password-input"
import "@ui-sdk/web/field"
import { createElement, Eye, EyeOff } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-field>
        <ui-field-label>كلمة المرور</ui-field-label>
        <ui-password-input name="password">
          <input />
          <ui-password-input-toggle>
            <button aria-label="إظهار كلمة المرور">
              ${createElement(Eye, { "aria-hidden": "true" }).outerHTML}
              ${createElement(EyeOff, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-password-input-toggle>
        </ui-password-input>
        <ui-field-description>ثمانية أحرف على الأقل.</ui-field-description>
      </ui-field>
    </div>
  `
}

export { mount }

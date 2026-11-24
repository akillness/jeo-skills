import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack" dir="rtl">
      <label data-slot="label">
        <ui-checkbox>
          <ui-checkbox-indicator>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-checkbox-indicator>
        </ui-checkbox>
        قبول الشروط والأحكام
      </label>
      <label data-slot="label">
        <ui-checkbox default-checked>
          <ui-checkbox-indicator>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-checkbox-indicator>
        </ui-checkbox>
        تفعيل الإشعارات
      </label>
    </div>
  `
}

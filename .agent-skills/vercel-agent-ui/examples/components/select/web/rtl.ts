import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const languages = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
  { value: "fr", label: "الفرنسية" },
  { value: "es", label: "الإسبانية" },
  { value: "de", label: "الألمانية" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-field>
        <ui-field-label>اللغة</ui-field-label>
        <ui-select placeholder="اختر لغة">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${languages
              .map(
                (language) => `
                  <ui-select-item value="${language.value}">
                    ${language.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
    </div>
  `
}

export { mount }

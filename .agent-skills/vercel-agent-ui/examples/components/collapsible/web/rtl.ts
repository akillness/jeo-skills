import "@ui-sdk/web/collapsible"
import { ChevronDown, createElement } from "lucide"

const details = [
  { label: "عنوان الشحن", value: "شارع الملك فهد، الرياض" },
  { label: "المنتجات", value: "قميص كتان × ٢" },
  { label: "التوصيل", value: "عادي، يصل في ٧ مارس" },
  { label: "الإجمالي", value: "٨٤٫٠٠ $" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-collapsible>
        <div data-slot="row">
          <div data-slot="stack">
            <p>الطلب #4189</p>
            <p data-slot="hint">تم الطلب في ٣ مارس</p>
          </div>
          <span data-slot="row">تم الشحن</span>
        </div>
        <div>
          <ui-collapsible-trigger>
            <button data-variant="ghost">
              تفاصيل الطلب
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-collapsible-trigger>
          <ui-collapsible-panel>
            <dl>
              ${details
                .map(
                  (detail) => `
                    <div data-slot="row">
                      <dt>${detail.label}</dt>
                      <dd>${detail.value}</dd>
                    </div>`
                )
                .join("")}
            </dl>
          </ui-collapsible-panel>
        </div>
      </ui-collapsible>
    </div>
  `
}

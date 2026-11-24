import "@ui-sdk/web/combobox"
import { Check, ChevronDown, createElement } from "lucide"

const cities = [
  { value: "cairo", label: "القاهرة" },
  { value: "dubai", label: "دبي" },
  { value: "riyadh", label: "الرياض" },
  { value: "beirut", label: "بيروت" },
  { value: "amman", label: "عمّان" },
  { value: "rabat", label: "الرباط" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-combobox>
        <div data-slot="stack">
          <ui-combobox-label>المدينة</ui-combobox-label>
          <div data-slot="row">
            <ui-combobox-input>
              <input placeholder="ابحث عن مدينة…" />
            </ui-combobox-input>
            <ui-combobox-trigger>
              <button aria-label="عرض المدن">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
            </ui-combobox-trigger>
          </div>
        </div>
        <ui-combobox-content>
          <ui-combobox-empty>لا توجد نتائج.</ui-combobox-empty>
          <ui-combobox-list>
            ${cities
              .map(
                (city) => `
                  <ui-combobox-item value="${city.value}" label="${city.label}">
                    ${city.label}
                    <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
                  </ui-combobox-item>
                `
              )
              .join("")}
          </ui-combobox-list>
        </ui-combobox-content>
      </ui-combobox>
    </div>
  `
}

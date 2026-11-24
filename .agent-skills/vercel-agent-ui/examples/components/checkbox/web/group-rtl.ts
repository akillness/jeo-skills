import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"

const toppings = [
  { value: "cheese", label: "جبن" },
  { value: "mushrooms", label: "فطر" },
  { value: "olives", label: "زيتون" },
  { value: "peppers", label: "فلفل" },
]

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack" dir="rtl">
      <h3 id="rtl-toppings">الإضافات</h3>
      <ui-checkbox-group aria-labelledby="rtl-toppings" default-value="cheese">
        ${toppings
          .map(
            (topping) => `
              <label data-slot="label">
                <ui-checkbox value="${topping.value}">
                  <ui-checkbox-indicator>
                    ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
                  </ui-checkbox-indicator>
                </ui-checkbox>
                ${topping.label}
              </label>
            `
          )
          .join("")}
      </ui-checkbox-group>
    </div>
  `
}

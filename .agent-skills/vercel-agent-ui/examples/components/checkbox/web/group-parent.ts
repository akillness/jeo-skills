import "@ui-sdk/web/checkbox"
import { Check, createElement, Minus } from "lucide"

const toppings = [
  { value: "cheese", label: "Cheese" },
  { value: "mushrooms", label: "Mushrooms" },
  { value: "olives", label: "Olives" },
  { value: "peppers", label: "Peppers" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <h3 id="parent-toppings">Toppings</h3>
      <ui-checkbox-group
        aria-labelledby="parent-toppings"
        default-value="cheese,olives"
        all-values="${toppings.map((topping) => topping.value).join(",")}"
      >
        <label data-slot="label">
          <ui-checkbox parent>
            <ui-checkbox-indicator>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
              ${createElement(Minus, { "aria-hidden": "true" }).outerHTML}
            </ui-checkbox-indicator>
          </ui-checkbox>
          Select all
        </label>
        <div data-slot="stack">
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
        </div>
      </ui-checkbox-group>
    </div>
  `
}

export { mount }

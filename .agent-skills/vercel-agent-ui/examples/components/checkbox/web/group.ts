import "@ui-sdk/web/checkbox"
import { Check, createElement } from "lucide"

const toppings = [
  { value: "cheese", label: "Cheese" },
  { value: "mushrooms", label: "Mushrooms" },
  { value: "olives", label: "Olives" },
  { value: "peppers", label: "Peppers" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <h3 id="basic-toppings">Toppings</h3>
      <ui-checkbox-group aria-labelledby="basic-toppings" default-value="cheese">
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

export { mount }

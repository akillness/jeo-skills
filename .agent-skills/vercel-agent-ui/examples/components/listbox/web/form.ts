import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const toppings = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Extra cheese" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "onion", label: "Onion" },
  { value: "pepper", label: "Pepper" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-listbox multiple name="toppings" form="pizza-order" required default-value="cheese" aria-label="Toppings">
        ${toppings
          .map(
            (topping) => `
              <ui-listbox-item value="${topping.value}">
                ${topping.label}
                <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
              </ui-listbox-item>`
          )
          .join("")}
      </ui-listbox>
      <form id="pizza-order" data-slot="row">
        <button type="reset">Reset</button>
        <button data-variant="solid">Order</button>
      </form>
    </div>
  `
  const form = root.querySelector("form")!
  form.addEventListener("submit", (event) => {
    event.preventDefault()
    log(root, `Ordered ${new FormData(form).getAll("toppings").join(", ")}`)
  })
}

export { mount }

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
    <ui-listbox multiple default-value="cheese,onion" aria-label="Toppings">
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
  `
  root.querySelector("ui-listbox")!.addEventListener("valuechange", (event) => {
    log(
      root,
      `${(event.detail.value as string[]).join(", ") || "Nothing"} (${event.detail.reason})`
    )
  })
}

export { mount }

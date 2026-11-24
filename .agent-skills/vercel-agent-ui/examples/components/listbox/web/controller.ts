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
      <div data-slot="controls">
        <button type="button" data-run="selectAll">Select All</button>
        <button type="button" data-run="clear">Clear</button>
        <button type="button" data-run="focus">Focus</button>
      </div>
      <ui-listbox multiple aria-label="Toppings">
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
    </div>
  `
  const listbox = root.querySelector("ui-listbox")!
  for (const button of root.querySelectorAll<HTMLButtonElement>("[data-run]")) {
    button.addEventListener("click", () =>
      listbox.api[button.dataset.run as "selectAll" | "clear" | "focus"]()
    )
  }
  listbox.addEventListener("valuechange", (event) => {
    log(
      root,
      `${(event.detail.value as string[]).length} selected (${event.detail.reason})`
    )
  })
}

export { mount }

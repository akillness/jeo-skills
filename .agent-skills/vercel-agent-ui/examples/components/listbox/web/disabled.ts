import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"

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
        <button type="button">Disable the List</button>
      </div>
      <ui-listbox multiple default-value="basil" aria-label="Toppings">
        ${toppings
          .map(
            (topping) => `
              <ui-listbox-item value="${topping.value}"${topping.value === "olive" ? " disabled" : ""}>
                ${topping.label}
                <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
              </ui-listbox-item>`
          )
          .join("")}
      </ui-listbox>
    </div>
  `
  const listbox = root.querySelector("ui-listbox")!
  const button = root.querySelector("button")!
  button.addEventListener("click", () => {
    const disabled = listbox.toggleAttribute("disabled")
    button.textContent = disabled ? "Enable the List" : "Disable the List"
  })
}

export { mount }

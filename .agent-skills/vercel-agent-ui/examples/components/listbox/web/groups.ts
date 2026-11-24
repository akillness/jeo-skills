import "@ui-sdk/web/listbox"
import { Check, createElement } from "lucide"

const produce = [
  {
    label: "Fruits",
    items: [
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
      { value: "orange", label: "Orange" },
    ],
  },
  {
    label: "Vegetables",
    items: [
      { value: "carrot", label: "Carrot" },
      { value: "broccoli", label: "Broccoli" },
      { value: "spinach", label: "Spinach" },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-listbox multiple default-value="banana" aria-label="Produce">
      ${produce
        .map(
          (group, index) => `
            ${index > 0 ? `<ui-listbox-separator></ui-listbox-separator>` : ""}
            <ui-listbox-group>
              <ui-listbox-group-label>${group.label}</ui-listbox-group-label>
              ${group.items
                .map(
                  (item) => `
                    <ui-listbox-item value="${item.value}">
                      ${item.label}
                      <ui-listbox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-listbox-item-indicator>
                    </ui-listbox-item>`
                )
                .join("")}
            </ui-listbox-group>`
        )
        .join("")}
    </ui-listbox>
  `
}

export { mount }

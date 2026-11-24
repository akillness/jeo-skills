import "@ui-sdk/web/accordion"
import { ChevronDown, createElement } from "lucide"

const items = [
  {
    value: "one",
    label: "Why animate the height?",
    content: "So the content below slides instead of jumping.",
  },
  {
    value: "two",
    label: "Where does the height come from?",
    content:
      "The panel measures itself and writes the result to a CSS variable while it animates.",
  },
  {
    value: "three",
    label: "Does it animate on first paint?",
    content: "No. Panels open on the server or on mount show at once.",
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-accordion default-value="one">
      ${items
        .map(
          (item) => `
            <ui-accordion-item value="${item.value}">
              <ui-accordion-header>
                <h3>
                  <ui-accordion-trigger>
                    <button type="button" aria-expanded="${item.value === "one"}">
                      ${item.label}
                      ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
                    </button>
                  </ui-accordion-trigger>
                </h3>
              </ui-accordion-header>
              <ui-accordion-panel${item.value === "one" ? "" : " hidden"}>
                ${item.content}
              </ui-accordion-panel>
            </ui-accordion-item>`
        )
        .join("")}
    </ui-accordion>
  `
}

export { mount }

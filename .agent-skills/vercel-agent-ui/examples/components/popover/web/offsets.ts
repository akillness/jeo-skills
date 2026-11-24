import "@ui-sdk/web/popover"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const choices = [
  {
    attribute: "side-offset",
    label: "Side offset",
    value: "8",
    values: ["4", "8", "16", "24"],
  },
  {
    attribute: "align-offset",
    label: "Align offset",
    value: "0",
    values: ["-16", "0", "16"],
  },
  {
    attribute: "collision-padding",
    label: "Collision padding",
    value: "8",
    values: ["8", "24", "48"],
  },
]

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML
const chevron = createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${choices
          .map(
            (choice) => `
              <ui-select data-attribute="${choice.attribute}" default-value="${choice.value}">
                <ui-select-label>${choice.label}</ui-select-label>
                <ui-select-trigger>
                  <button>
                    <ui-select-value></ui-select-value>
                    ${chevron}
                  </button>
                </ui-select-trigger>
                <ui-select-content hidden>
                  ${choice.values
                    .map(
                      (value) => `
                        <ui-select-item value="${value}">
                          ${value}px
                          <ui-select-item-indicator>${check}</ui-select-item-indicator>
                        </ui-select-item>
                      `
                    )
                    .join("")}
                </ui-select-content>
              </ui-select>
            `
          )
          .join("")}
      </div>
      <ui-popover>
        <ui-popover-trigger>
          <button>Delivery</button>
        </ui-popover-trigger>
        <ui-popover-content align="start" side-offset="8" align-offset="0" collision-padding="8">
          <ui-popover-title>Delivery window</ui-popover-title>
          <ui-popover-description>Arrives Tuesday between 9 AM and noon.</ui-popover-description>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
  const content = root.querySelector("ui-popover-content")!
  for (const control of root.querySelectorAll("ui-select")) {
    control.addEventListener("valuechange", (event) => {
      const value = event.detail.value
      if (typeof value === "string") {
        content.setAttribute(control.dataset.attribute!, value)
      }
    })
  }
}

export { mount }

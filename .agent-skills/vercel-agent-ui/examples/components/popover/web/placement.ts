import "@ui-sdk/web/popover"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const sides = [
  { value: "top", label: "Top" },
  { value: "right", label: "Right" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
]
const aligns = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
]

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML
const chevron = createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML

function select(
  attribute: string,
  label: string,
  value: string,
  options: { value: string; label: string }[]
) {
  return `
    <ui-select data-attribute="${attribute}" default-value="${value}">
      <ui-select-label>${label}</ui-select-label>
      <ui-select-trigger>
        <button>
          <ui-select-value></ui-select-value>
          ${chevron}
        </button>
      </ui-select-trigger>
      <ui-select-content hidden>
        ${options
          .map(
            (option) => `
              <ui-select-item value="${option.value}">
                ${option.label}
                <ui-select-item-indicator>${check}</ui-select-item-indicator>
              </ui-select-item>
            `
          )
          .join("")}
      </ui-select-content>
    </ui-select>
  `
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        ${select("side", "Side", "bottom", sides)}
        ${select("align", "Align", "center", aligns)}
      </div>
      <ui-popover>
        <ui-popover-trigger>
          <button>Delivery</button>
        </ui-popover-trigger>
        <ui-popover-content side="bottom" align="center" side-offset="8">
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

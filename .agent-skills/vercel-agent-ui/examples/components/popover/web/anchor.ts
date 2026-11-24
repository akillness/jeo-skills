import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/popover"
import { Check, createElement, SlidersHorizontal } from "lucide"

const types = [
  { label: "Documents", checked: true },
  { label: "Images", checked: false },
  { label: "Shared with me", checked: true },
]

const check = createElement(Check, { "aria-hidden": "true" }).outerHTML

let count = 0

function mount(root: HTMLElement) {
  const id = `popover-anchor-${++count}`
  root.innerHTML = `
    <div data-slot="row">
      <input id="${id}" type="search" placeholder="Search files…" aria-label="Search files" />
      <ui-popover>
        <ui-popover-trigger>
          <button aria-label="Search filters">${createElement(SlidersHorizontal, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-popover-trigger>
        <ui-popover-content anchor="#${id}" align="start" side-offset="8">
          <ui-popover-title>Filters</ui-popover-title>
          <ui-popover-description>Show only these kinds of files.</ui-popover-description>
          <div data-slot="stack">
            ${types
              .map(
                (type) => `
                  <label data-slot="label">
                    <ui-checkbox${type.checked ? " default-checked" : ""}>
                      <ui-checkbox-indicator>${check}</ui-checkbox-indicator>
                    </ui-checkbox>
                    ${type.label}
                  </label>
                `
              )
              .join("")}
          </div>
          <div data-slot="row">
            <ui-popover-close>
              <button>Cancel</button>
            </ui-popover-close>
            <ui-popover-close>
              <button data-variant="solid">Apply</button>
            </ui-popover-close>
          </div>
        </ui-popover-content>
      </ui-popover>
    </div>
  `
}

export { mount }

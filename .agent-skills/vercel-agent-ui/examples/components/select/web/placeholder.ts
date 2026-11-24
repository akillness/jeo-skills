import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const sizes = ["Extra small", "Small", "Medium", "Large", "Extra large"]

const wraps = ["Paper", "Ribbon", "Box"]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-field>
        <ui-field-label>Size</ui-field-label>
        <ui-select placeholder="Select a size">
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${sizes
              .map(
                (size) => `
                  <ui-select-item value="${size}">
                    ${size}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
      <ui-field>
        <ui-field-label>Gift wrap</ui-field-label>
        <ui-select>
          <ui-select-trigger>
            <button>
              <ui-select-value placeholder="None"></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${wraps
              .map(
                (wrap) => `
                  <ui-select-item value="${wrap}">
                    ${wrap}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </ui-field>
    </div>
  `
}

export { mount }

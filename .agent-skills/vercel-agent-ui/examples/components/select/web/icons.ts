import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import {
  Check,
  ChevronDown,
  createElement,
  TextAlignCenter,
  TextAlignEnd,
  TextAlignStart,
} from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Text alignment</ui-field-label>
      <ui-select default-value="start">
        <ui-select-trigger>
          <button>
            <ui-select-value-icon></ui-select-value-icon>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          <ui-select-item value="start">
            <ui-select-item-icon mirror>${createElement(TextAlignStart, { "aria-hidden": "true" }).outerHTML}</ui-select-item-icon>
            Start
            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
          </ui-select-item>
          <ui-select-item value="center">
            <ui-select-item-icon>${createElement(TextAlignCenter, { "aria-hidden": "true" }).outerHTML}</ui-select-item-icon>
            Center
            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
          </ui-select-item>
          <ui-select-item value="end">
            <ui-select-item-icon mirror>${createElement(TextAlignEnd, { "aria-hidden": "true" }).outerHTML}</ui-select-item-icon>
            End
            <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
          </ui-select-item>
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
}

export { mount }

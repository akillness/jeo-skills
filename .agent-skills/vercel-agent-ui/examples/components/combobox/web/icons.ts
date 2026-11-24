import "@ui-sdk/web/combobox"
import {
  ArrowRight,
  Check,
  ChevronDown,
  Circle,
  CircleCheck,
  CircleX,
  createElement,
} from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Status</ui-combobox-label>
        <div id="combobox-icons-field" data-slot="row">
          <ui-combobox-value-icon></ui-combobox-value-icon>
          <ui-combobox-input>
            <input placeholder="Select a status" />
          </ui-combobox-input>
          <ui-combobox-trigger>
            <button aria-label="Show statuses">${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden anchor="#combobox-icons-field">
        <ui-combobox-empty>No statuses found.</ui-combobox-empty>
        <ui-combobox-list>
          <ui-combobox-item value="backlog" label="Backlog">
            <ui-combobox-item-icon>${createElement(Circle, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-icon>
            <ui-combobox-item-text>Backlog</ui-combobox-item-text>
            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
          </ui-combobox-item>
          <ui-combobox-item value="in-progress" label="In progress">
            <ui-combobox-item-icon mirror>${createElement(ArrowRight, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-icon>
            <ui-combobox-item-text>In progress</ui-combobox-item-text>
            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
          </ui-combobox-item>
          <ui-combobox-item value="done" label="Done">
            <ui-combobox-item-icon>${createElement(CircleCheck, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-icon>
            <ui-combobox-item-text>Done</ui-combobox-item-text>
            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
          </ui-combobox-item>
          <ui-combobox-item value="canceled" label="Canceled">
            <ui-combobox-item-icon>${createElement(CircleX, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-icon>
            <ui-combobox-item-text>Canceled</ui-combobox-item-text>
            <ui-combobox-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-combobox-item-indicator>
          </ui-combobox-item>
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
}

export { mount }

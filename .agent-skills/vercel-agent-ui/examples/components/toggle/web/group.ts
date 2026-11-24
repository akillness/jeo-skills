import "@ui-sdk/web/toggle"
import { Bold, createElement, Italic, Underline } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-toggle-group multiple aria-label="Text formatting">
      <ui-toggle value="bold">
        <button aria-label="Bold">
          <ui-toggle-icon>${createElement(Bold, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
        </button>
      </ui-toggle>
      <ui-toggle value="italic">
        <button aria-label="Italic">
          <ui-toggle-icon>${createElement(Italic, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
        </button>
      </ui-toggle>
      <ui-toggle value="underline">
        <button aria-label="Underline">
          <ui-toggle-icon>${createElement(Underline, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
        </button>
      </ui-toggle>
    </ui-toggle-group>
  `
}

export { mount }

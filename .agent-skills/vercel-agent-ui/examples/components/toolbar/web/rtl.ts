import "@ui-sdk/web/toolbar"
import "@ui-sdk/web/toggle"
import { Bold, createElement, Italic, Link } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div dir="rtl">
      <ui-toolbar aria-label="تنسيق">
        <ui-toggle>
          <button aria-label="غامق">
            <ui-toggle-icon>${createElement(Bold, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
          </button>
        </ui-toggle>
        <ui-toggle>
          <button aria-label="مائل">
            <ui-toggle-icon>${createElement(Italic, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
          </button>
        </ui-toggle>
        <ui-toolbar-separator></ui-toolbar-separator>
        <ui-toolbar-button>
          <button aria-label="إدراج رابط">
            ${createElement(Link, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-toolbar-button>
      </ui-toolbar>
    </div>
  `
}

export { mount }

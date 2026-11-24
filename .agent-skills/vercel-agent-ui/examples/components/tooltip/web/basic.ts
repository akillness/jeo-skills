import "@ui-sdk/web/tooltip"
import { Bookmark, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-tooltip default-open>
      <ui-tooltip-trigger>
        <button aria-label="Add to library">${createElement(Bookmark, { "aria-hidden": "true" }).outerHTML}</button>
      </ui-tooltip-trigger>
      <ui-tooltip-content>Add to library</ui-tooltip-content>
    </ui-tooltip>
  `
}

export { mount }

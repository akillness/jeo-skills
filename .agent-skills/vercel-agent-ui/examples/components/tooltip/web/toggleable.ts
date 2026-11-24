import "@ui-sdk/web/tooltip"
import { createElement, Info } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <span data-slot="label">Storage</span>
      <ui-tooltip toggleable>
        <ui-tooltip-trigger>
          <button aria-label="About storage" data-size="sm">${createElement(Info, { "aria-hidden": "true" }).outerHTML}</button>
        </ui-tooltip-trigger>
        <ui-tooltip-content>Files in the trash still use storage.</ui-tooltip-content>
      </ui-tooltip>
      <span data-slot="hint">12.4 of 15 GB used</span>
    </div>
  `
}

export { mount }

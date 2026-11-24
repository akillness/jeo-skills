import "@ui-sdk/web/resizable"
import { createElement, Folder, Search, Settings } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="30" min-size="25" collapsible collapsed-size="48px">
        <ul>
          <li data-slot="row">
            ${createElement(Folder, { "aria-hidden": "true" }).outerHTML}
            <span>Files</span>
          </li>
          <li data-slot="row">
            ${createElement(Search, { "aria-hidden": "true" }).outerHTML}
            <span>Search</span>
          </li>
          <li data-slot="row">
            ${createElement(Settings, { "aria-hidden": "true" }).outerHTML}
            <span>Settings</span>
          </li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize sidebar"><div></div></ui-resizable-handle>
      <ui-resizable-panel min-size="40">
        <h3>README.md</h3>
        <span data-slot="hint">Edited by Inès Moreau</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
}

export { mount }

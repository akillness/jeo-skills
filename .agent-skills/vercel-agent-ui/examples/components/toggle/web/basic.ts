import "@ui-sdk/web/toggle"
import { createElement, Star } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="card">
      <div data-slot="stack">
        <h3>Q3 Roadmap</h3>
        <p data-slot="hint">Edited by Hollis Grant</p>
      </div>
      <ui-toggle>
        <button aria-label="Star">
          <ui-toggle-icon data-variant="fill">${createElement(Star, { "aria-hidden": "true" }).outerHTML}</ui-toggle-icon>
        </button>
      </ui-toggle>
    </div>
  `
}

export { mount }

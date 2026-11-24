import "@ui-sdk/web/checkbox"
import "@ui-sdk/web/resizable"
import { Check, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <label data-slot="label">
          <ui-checkbox>
            <ui-checkbox-indicator>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            </ui-checkbox-indicator>
          </ui-checkbox>
          Lock layout
        </label>
      </div>
      <ui-resizable>
        <ui-resizable-panel min-size="15">
          <h3>Pinned</h3>
          <span data-slot="hint">2 notes</span>
        </ui-resizable-panel>
        <ui-resizable-handle disabled aria-label="Resize pinned"></ui-resizable-handle>
        <ui-resizable-panel min-size="15">
          <h3>Inbox</h3>
          <span data-slot="hint">3 unread</span>
        </ui-resizable-panel>
        <ui-resizable-handle aria-label="Resize inbox"></ui-resizable-handle>
        <ui-resizable-panel min-size="15">
          <h3>Message</h3>
          <span data-slot="hint">From Kofi Mensah</span>
        </ui-resizable-panel>
      </ui-resizable>
    </div>
  `
  const group = root.querySelector("ui-resizable")!
  root
    .querySelector("ui-checkbox")!
    .addEventListener("checkedchange", (event) => {
      group.toggleAttribute("disabled", event.detail.value === true)
    })
}

export { mount }

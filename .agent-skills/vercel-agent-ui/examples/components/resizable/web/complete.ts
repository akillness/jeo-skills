import "@ui-sdk/web/resizable"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-resizable>
      <ui-resizable-panel default-size="40" min-size="20">
        <h3>Files</h3>
        <ul>
          <li>page.tsx</li>
          <li>layout.tsx</li>
          <li>globals.css</li>
        </ul>
      </ui-resizable-panel>
      <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
      <ui-resizable-panel min-size="20">
        <h3>page.tsx</h3>
        <span data-slot="hint">Saved just now</span>
      </ui-resizable-panel>
    </ui-resizable>
  `
  root
    .querySelector("ui-resizable")!
    .addEventListener("layoutcommit", (event) => {
      log(
        root,
        `Saved ${event.detail.value.map(Math.round).join(" / ")} (${event.detail.reason})`
      )
    })
}

export { mount }

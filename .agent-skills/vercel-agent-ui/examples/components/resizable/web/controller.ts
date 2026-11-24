import "@ui-sdk/web/resizable"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="collapse">Collapse</button>
        <button type="button" data-action="expand">Expand</button>
        <button type="button" data-action="resize">240px</button>
        <button type="button" data-action="read">Read</button>
      </div>
      <ui-resizable>
        <ui-resizable-panel id="controller-sidebar" default-size="30" min-size="20" collapsible>
          <h3>Files</h3>
          <ul>
            <li>page.tsx</li>
            <li>layout.tsx</li>
            <li>globals.css</li>
          </ul>
        </ui-resizable-panel>
        <ui-resizable-handle aria-label="Resize files"></ui-resizable-handle>
        <ui-resizable-panel min-size="30">
          <h3>page.tsx</h3>
          <span data-slot="hint">Saved just now</span>
        </ui-resizable-panel>
      </ui-resizable>
    </div>
  `
  const editor = root.querySelector("ui-resizable")!.api
  const actions: Record<string, () => void> = {
    collapse: () => editor.collapse("controller-sidebar"),
    expand: () => editor.expand("controller-sidebar"),
    resize: () => editor.resize("controller-sidebar", "240px"),
    read: () =>
      log(
        root,
        `Layout ${editor.getLayout().map(Math.round).join(" / ")}${editor.isCollapsed("controller-sidebar") ? ", collapsed" : ""}`
      ),
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
}

export { mount }

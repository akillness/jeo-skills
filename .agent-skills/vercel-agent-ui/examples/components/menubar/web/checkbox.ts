import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"
import { Check, createElement } from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <ui-menubar>
        <ui-menu>
          <ui-menu-trigger>
            <button>View</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-checkbox-item value="status-bar" checked="true">
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Status Bar
            </ui-menu-checkbox-item>
            <ui-menu-checkbox-item value="activity-bar" default-checked>
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Activity Bar
            </ui-menu-checkbox-item>
          </ui-menu-content>
        </ui-menu>
        <ui-menu>
          <ui-menu-trigger>
            <button>Format</button>
          </ui-menu-trigger>
          <ui-menu-content>
            <ui-menu-checkbox-item value="strikethrough">
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Strikethrough
            </ui-menu-checkbox-item>
            <ui-menu-checkbox-item value="code">
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Code
            </ui-menu-checkbox-item>
          </ui-menu-content>
        </ui-menu>
      </ui-menubar>
      <output data-slot="output">Status bar shown</output>
    </div>
  `
  const statusBar = root.querySelector("[value=status-bar]")!
  statusBar.addEventListener("checkedchange", (event) => {
    const { value } = (event as CustomEvent<{ value: boolean }>).detail
    statusBar.setAttribute("checked", String(value))
    root.querySelector("output")!.textContent =
      `Status bar ${value ? "shown" : "hidden"}`
  })
}

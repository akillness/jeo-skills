import "@ui-sdk/web/menu"
import { Check, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>View</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-group>
          <ui-menu-group-label>Appearance</ui-menu-group-label>
          <ui-menu-checkbox-item value="status-bar" default-checked>
            <ui-menu-item-indicator keep-mounted>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-item-indicator>
            Status bar
          </ui-menu-checkbox-item>
          <ui-menu-checkbox-item value="minimap">
            <ui-menu-item-indicator keep-mounted>
              ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-item-indicator>
            Minimap
          </ui-menu-checkbox-item>
        </ui-menu-group>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-checkbox-item value="line-numbers" default-checked>
          <ui-menu-item-indicator keep-mounted>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-item-indicator>
          Line numbers
        </ui-menu-checkbox-item>
        <ui-menu-checkbox-item value="word-wrap">
          <ui-menu-item-indicator keep-mounted>
            ${createElement(Check, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-item-indicator>
          Word wrap
        </ui-menu-checkbox-item>
      </ui-menu-content>
    </ui-menu>
  `
  for (const item of root.querySelectorAll("ui-menu-checkbox-item")) {
    item.addEventListener("checkedchange", (event) => {
      log(root, `${item.value} ${event.detail.value ? "on" : "off"}`)
    })
  }
}

export { mount }

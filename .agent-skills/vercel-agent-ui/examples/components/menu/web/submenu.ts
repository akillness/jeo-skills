import "@ui-sdk/web/menu"
import { ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>Edit</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-item value="undo" shortcut="mod+z">Undo</ui-menu-item>
        <ui-menu-item value="redo" shortcut="mod+shift+z">Redo</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-sub>
          <ui-menu-sub-trigger>
            Find
            ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-sub-trigger>
          <ui-menu-sub-content>
            <ui-menu-item value="find" shortcut="mod+f">Find…</ui-menu-item>
            <ui-menu-item value="find-next" shortcut="mod+g">Find next</ui-menu-item>
            <ui-menu-item value="find-previous" shortcut="mod+shift+g">Find previous</ui-menu-item>
          </ui-menu-sub-content>
        </ui-menu-sub>
        <ui-menu-sub>
          <ui-menu-sub-trigger>
            Transform
            ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-sub-trigger>
          <ui-menu-sub-content>
            <ui-menu-sub>
              <ui-menu-sub-trigger>
                Case
                ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
              </ui-menu-sub-trigger>
              <ui-menu-sub-content>
                <ui-menu-item value="uppercase">Uppercase</ui-menu-item>
                <ui-menu-item value="lowercase">Lowercase</ui-menu-item>
              </ui-menu-sub-content>
            </ui-menu-sub>
            <ui-menu-item value="trim">Trim whitespace</ui-menu-item>
          </ui-menu-sub-content>
        </ui-menu-sub>
      </ui-menu-content>
    </ui-menu>
  `
  root
    .querySelector("ui-menu")!
    .addEventListener("action", (event) =>
      log(root, `Chose ${event.detail.value}`)
    )
}

export { mount }

import "@ui-sdk/web/menu"
import { ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>Animated</button>
      </ui-menu-trigger>
      <ui-menu-content keep-mounted>
        <ui-menu-item>Back</ui-menu-item>
        <ui-menu-item>Forward</ui-menu-item>
        <ui-menu-item>Reload</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-sub>
          <ui-menu-sub-trigger>
            More tools
            ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
          </ui-menu-sub-trigger>
          <ui-menu-sub-content>
            <ui-menu-item>Save page as…</ui-menu-item>
            <ui-menu-item>Developer tools</ui-menu-item>
          </ui-menu-sub-content>
        </ui-menu-sub>
      </ui-menu-content>
    </ui-menu>
  `
  const menu = root.querySelector("ui-menu")!
  menu.addEventListener("openchange", (event) =>
    log(root, event.detail.value ? "Opening" : "Closing")
  )
  menu.addEventListener("openchangecomplete", (event) =>
    log(root, event.detail.value ? "Finished opening" : "Finished closing")
  )
}

export { mount }

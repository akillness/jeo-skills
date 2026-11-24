import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"
import { ChevronRight, createElement } from "lucide"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menubar>
      <ui-menu>
        <ui-menu-trigger>
          <button>File</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>New File</ui-menu-item>
          <ui-menu-sub>
            <ui-menu-sub-trigger>
              Share
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              <ui-menu-item>Email link</ui-menu-item>
              <ui-menu-item>Messages</ui-menu-item>
            </ui-menu-sub-content>
          </ui-menu-sub>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger>
          <button>Edit</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>Undo</ui-menu-item>
          <ui-menu-sub>
            <ui-menu-sub-trigger>
              Find
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              <ui-menu-item>Find…</ui-menu-item>
              <ui-menu-item>Find Next</ui-menu-item>
            </ui-menu-sub-content>
          </ui-menu-sub>
        </ui-menu-content>
      </ui-menu>
    </ui-menubar>
  `
}

export { mount }

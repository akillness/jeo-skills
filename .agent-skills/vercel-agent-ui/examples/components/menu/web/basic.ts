import "@ui-sdk/web/menu"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>Open Menu</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-group>
          <ui-menu-group-label>Project</ui-menu-group-label>
          <ui-menu-item value="overview">Overview</ui-menu-item>
          <ui-menu-item value="members">Members</ui-menu-item>
          <ui-menu-item value="settings">Settings</ui-menu-item>
        </ui-menu-group>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-group>
          <ui-menu-group-label>Help</ui-menu-group-label>
          <ui-menu-item value="docs">Documentation</ui-menu-item>
          <ui-menu-item value="feedback">Send feedback</ui-menu-item>
        </ui-menu-group>
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

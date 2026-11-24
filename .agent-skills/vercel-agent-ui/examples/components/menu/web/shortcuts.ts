import "@ui-sdk/web/menu"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-trigger>
        <button>File</button>
      </ui-menu-trigger>
      <ui-menu-content>
        <ui-menu-item value="new-tab" shortcut="mod+t">New tab</ui-menu-item>
        <ui-menu-item value="new-window" shortcut="mod+n">New window</ui-menu-item>
        <ui-menu-item value="open" shortcut="mod+o">Open…</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-item value="save" shortcut="mod+s">Save</ui-menu-item>
        <ui-menu-item value="save-as" shortcut="mod+shift+s">Save as…</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-item value="print" shortcut="mod+p">Print…</ui-menu-item>
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

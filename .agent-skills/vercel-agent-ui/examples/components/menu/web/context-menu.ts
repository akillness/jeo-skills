import "@ui-sdk/web/menu"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menu>
      <ui-menu-context-trigger tabindex="0">Right-click or long-press here</ui-menu-context-trigger>
      <ui-menu-content>
        <ui-menu-item value="back">Back</ui-menu-item>
        <ui-menu-item value="forward" disabled>Forward</ui-menu-item>
        <ui-menu-item value="reload">Reload</ui-menu-item>
        <ui-menu-separator></ui-menu-separator>
        <ui-menu-item value="save">Save page as…</ui-menu-item>
        <ui-menu-item value="print">Print…</ui-menu-item>
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

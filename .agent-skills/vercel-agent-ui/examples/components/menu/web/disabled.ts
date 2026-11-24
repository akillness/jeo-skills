import "@ui-sdk/web/menu"
import { Check, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="row">
      <ui-menu>
        <ui-menu-trigger>
          <button>Document</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item value="undo" shortcut="mod+z" disabled>
            Undo
          </ui-menu-item>
          <ui-menu-item value="redo" shortcut="mod+shift+z">
            Redo
          </ui-menu-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-checkbox-item value="autosave" default-checked disabled>
            <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
            Autosave
          </ui-menu-checkbox-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-radio-group default-value="pdf">
            <ui-menu-group-label>Export as</ui-menu-group-label>
            <ui-menu-radio-item value="pdf">
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              PDF
            </ui-menu-radio-item>
            <ui-menu-radio-item value="docx" disabled>
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Word
            </ui-menu-radio-item>
            <ui-menu-radio-item value="markdown">
              <ui-menu-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-indicator>
              Markdown
            </ui-menu-radio-item>
          </ui-menu-radio-group>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-sub>
            <ui-menu-sub-trigger disabled>
              Move to
              ${createElement(ChevronRight, { "aria-hidden": "true" }).outerHTML}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              <ui-menu-item>Archive</ui-menu-item>
            </ui-menu-sub-content>
          </ui-menu-sub>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger disabled>
          <button>Locked</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>Unlock</ui-menu-item>
        </ui-menu-content>
      </ui-menu>
    </div>
  `
  root
    .querySelector("ui-menu")!
    .addEventListener("action", (event) =>
      log(root, `Chose ${event.detail.value}`)
    )
}

export { mount }

import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"
import {
  CircleHelp,
  createElement,
  File,
  Folder,
  Redo,
  Save,
  Settings,
  Trash,
  Undo,
} from "lucide"

export function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-menubar>
      <ui-menu>
        <ui-menu-trigger>
          <button>File</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>
            <ui-menu-item-icon>${createElement(File, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            New File
          </ui-menu-item>
          <ui-menu-item>
            <ui-menu-item-icon>${createElement(Folder, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Open Folder
          </ui-menu-item>
          <ui-menu-item>
            <ui-menu-item-icon>${createElement(Save, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Save
          </ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger>
          <button>Edit</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>
            <ui-menu-item-icon mirror>${createElement(Undo, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Undo
          </ui-menu-item>
          <ui-menu-item>
            <ui-menu-item-icon mirror>${createElement(Redo, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Redo
          </ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger>
          <button>More</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item>
            <ui-menu-item-icon>${createElement(Settings, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Settings
          </ui-menu-item>
          <ui-menu-item>
            <ui-menu-item-icon>${createElement(CircleHelp, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Help
          </ui-menu-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-item destructive>
            <ui-menu-item-icon>${createElement(Trash, { "aria-hidden": "true" }).outerHTML}</ui-menu-item-icon>
            Delete
          </ui-menu-item>
        </ui-menu-content>
      </ui-menu>
    </ui-menubar>
  `
}

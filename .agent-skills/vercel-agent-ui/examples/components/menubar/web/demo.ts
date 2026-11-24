import "@ui-sdk/web/menubar"
import "@ui-sdk/web/menu"
import { Check, ChevronRight, createElement } from "lucide"
import { log } from "../../../shared/web/log"

const recent = ["Q3 roadmap", "Launch checklist", "Offsite notes"]
const formats = ["PDF", "Markdown", "HTML"]
const appearances = ["Light", "Dark", "System"]

function mount(root: HTMLElement) {
  const chevron = createElement(ChevronRight, {
    "aria-hidden": "true",
  }).outerHTML
  const check = createElement(Check, { "aria-hidden": "true" }).outerHTML
  root.innerHTML = `
    <ui-menubar>
      <ui-menu>
        <ui-menu-trigger>
          <button>File</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item value="New document" shortcut="mod+n">New Document</ui-menu-item>
          <ui-menu-item value="Open" shortcut="mod+o">Open…</ui-menu-item>
          <ui-menu-sub>
            <ui-menu-sub-trigger>
              Open Recent
              ${chevron}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              ${recent.map((name) => `<ui-menu-item value="${name}">${name}</ui-menu-item>`).join("")}
            </ui-menu-sub-content>
          </ui-menu-sub>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-sub>
            <ui-menu-sub-trigger>
              Export
              ${chevron}
            </ui-menu-sub-trigger>
            <ui-menu-sub-content>
              ${formats.map((format) => `<ui-menu-item value="Export as ${format}">${format}</ui-menu-item>`).join("")}
            </ui-menu-sub-content>
          </ui-menu-sub>
          <ui-menu-item value="Print" shortcut="mod+p">Print…</ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger>
          <button>Edit</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-item value="Undo" shortcut="mod+z" disabled>Undo</ui-menu-item>
          <ui-menu-item value="Redo" shortcut="mod+shift+z">Redo</ui-menu-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-item value="Cut" shortcut="mod+x">Cut</ui-menu-item>
          <ui-menu-item value="Copy" shortcut="mod+c">Copy</ui-menu-item>
          <ui-menu-item value="Paste" shortcut="mod+v">Paste</ui-menu-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-item value="Find" shortcut="mod+f">Find…</ui-menu-item>
        </ui-menu-content>
      </ui-menu>
      <ui-menu>
        <ui-menu-trigger>
          <button>View</button>
        </ui-menu-trigger>
        <ui-menu-content>
          <ui-menu-checkbox-item value="Ruler">
            <ui-menu-item-indicator>${check}</ui-menu-item-indicator>
            Show Ruler
          </ui-menu-checkbox-item>
          <ui-menu-checkbox-item value="Word count" default-checked>
            <ui-menu-item-indicator>${check}</ui-menu-item-indicator>
            Show Word Count
          </ui-menu-checkbox-item>
          <ui-menu-separator></ui-menu-separator>
          <ui-menu-radio-group default-value="System">
            <ui-menu-group-label>Appearance</ui-menu-group-label>
            ${appearances
              .map(
                (appearance) => `
                  <ui-menu-radio-item value="${appearance}">
                    <ui-menu-item-indicator></ui-menu-item-indicator>
                    ${appearance}
                  </ui-menu-radio-item>`
              )
              .join("")}
          </ui-menu-radio-group>
        </ui-menu-content>
      </ui-menu>
    </ui-menubar>
  `
  const [file, edit] = root.querySelectorAll("ui-menu")
  for (const menu of [file, edit]) {
    menu.addEventListener("action", (event) =>
      log(root, `Chose ${event.detail.value}`)
    )
  }
  for (const item of root.querySelectorAll("ui-menu-checkbox-item")) {
    item.addEventListener("checkedchange", (event) => {
      log(root, `${item.value} ${event.detail.value ? "on" : "off"}`)
    })
  }
  root
    .querySelector("ui-menu-radio-group")!
    .addEventListener("valuechange", (event) =>
      log(root, `${event.detail.value} appearance`)
    )
}

export { mount }

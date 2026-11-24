import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { textFieldAdapter } from "@ui-sdk/web/trigger-menu"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Notes</ui-field-label>
        <textarea placeholder="Type @ to mention someone…"></textarea>
      </ui-field>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  const menu = root.querySelector("ui-trigger-menu")!
  menu.editor = textFieldAdapter(root.querySelector("textarea")!)
  menu.triggers = [{ char: "@", items: people }]
}

export { mount }

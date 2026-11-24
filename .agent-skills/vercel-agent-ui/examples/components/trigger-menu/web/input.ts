import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu auto-highlight="false" loop="false">
      <ui-field>
        <ui-field-label>Task</ui-field-label>
        <ui-trigger-menu-input>
          <input placeholder="Type @ to assign someone…" />
        </ui-trigger-menu-input>
      </ui-field>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", items: people },
  ]
}

export { mount }

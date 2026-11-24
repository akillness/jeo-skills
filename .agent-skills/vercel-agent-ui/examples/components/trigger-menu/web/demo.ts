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
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type @ to mention someone…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
      <div data-slot="visually-hidden">
        <ui-trigger-menu-status></ui-trigger-menu-status>
      </div>
      <ui-trigger-menu-content>
        <ui-trigger-menu-empty>No one found</ui-trigger-menu-empty>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", type: "mention", items: people },
  ]
}

export { mount }

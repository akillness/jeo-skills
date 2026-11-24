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
  const id = `comment-${crypto.randomUUID()}`
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field id="${id}">
        <ui-field-label>Comment</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type @ to mention someone…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
      <ui-trigger-menu-content
        side="top"
        align="start"
        side-offset="8"
        align-offset="-5"
        collision-padding="16"
        anchor="#${id}"
        container="#${id}"
        keep-mounted
      >
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", items: people },
  ]
}

export { mount }

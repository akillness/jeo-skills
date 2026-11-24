import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { log } from "../../../shared/web/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const commands = [
  {
    value: "status",
    label: "status",
    arguments: [
      {
        name: "status",
        hint: "<status>",
        required: true,
        items: ["available", "busy", "away"],
      },
    ],
  },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu shortcut="ctrl+j">
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type @ or /…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
    </ui-trigger-menu>
  `
  const menu = root.querySelector("ui-trigger-menu")!
  menu.triggers = [
    { char: "@", items: people },
    { char: "/", boundary: "start", items: commands },
  ]
  menu.addEventListener("openchange", (event) => {
    const { value, reason } = event.detail
    log(root, `${value ? "Opening" : "Closing"} (${reason})`)
  })
  menu.addEventListener("openchangecomplete", (event) =>
    log(root, event.detail.value ? "Open" : "Closed")
  )
  menu.addEventListener("querychange", (event) => {
    const { value, argument } = event.detail
    log(root, `Query “${value}”${argument ? ` for ${argument}` : ""}`)
  })
}

export { mount }

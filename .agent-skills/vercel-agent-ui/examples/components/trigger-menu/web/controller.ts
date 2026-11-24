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

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button">Mention</button>
        <button type="button">Insert Date</button>
      </div>
      <ui-trigger-menu>
        <ui-field>
          <ui-field-label>Message</ui-field-label>
          <ui-trigger-menu-input>
            <textarea placeholder="Write a message…"></textarea>
          </ui-trigger-menu-input>
        </ui-field>
        <ui-trigger-menu-content>
          <ui-trigger-menu-list></ui-trigger-menu-list>
        </ui-trigger-menu-content>
      </ui-trigger-menu>
    </div>
  `
  const element = root.querySelector("ui-trigger-menu")!
  const menu = element.api
  element.triggers = [{ char: "@", items: people }]
  const [mention, date] = root.querySelectorAll("button")
  root
    .querySelector("[data-slot=controls]")!
    .addEventListener("mousedown", (event) => event.preventDefault())
  mention.addEventListener("click", async () => {
    const closed = await menu.open({ trigger: "@" })
    log(root, `Closed (${closed.reason})`)
  })
  date.addEventListener("click", () =>
    menu.insert(
      new Date().toLocaleDateString("en-US", { month: "long", day: "numeric" })
    )
  )
}

export { mount }

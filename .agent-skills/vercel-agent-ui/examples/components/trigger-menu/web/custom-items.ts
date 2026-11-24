import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { createElement, Users } from "lucide"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik", disabled: true },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-trigger-menu>
      <ui-field>
        <ui-field-label>Message</ui-field-label>
        <ui-trigger-menu-input>
          <textarea placeholder="Type @ and a first name…"></textarea>
        </ui-trigger-menu-input>
      </ui-field>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list>
          <ui-trigger-menu-group>
            <ui-trigger-menu-group-label>People</ui-trigger-menu-group-label>
            ${people
              .map(
                (person) => `
                  <ui-trigger-menu-item value="${person.value}" label="${person.label}"${person.disabled ? " disabled" : ""}>
                    ${person.label}
                    <span data-slot="hint">${person.disabled ? "Deactivated" : `@${person.value}`}</span>
                  </ui-trigger-menu-item>`
              )
              .join("")}
          </ui-trigger-menu-group>
          <ui-trigger-menu-separator></ui-trigger-menu-separator>
          <ui-trigger-menu-item value="here" label="here" keywords="everyone,channel">
            <ui-trigger-menu-item-icon>
              ${createElement(Users, { "aria-hidden": "true" }).outerHTML}
            </ui-trigger-menu-item-icon>
            Notify everyone here
          </ui-trigger-menu-item>
        </ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  const menu = root.querySelector("ui-trigger-menu")!
  menu.triggers = [
    {
      char: "@",
      spaces: 2,
      maxLength: 30,
      pattern: /[\p{L}.'-]/u,
      filter: "startsWith",
      insert: (item) => `@${item.label.split(" ")[0]} `,
    },
  ]
  menu.addEventListener("itemselect", (event) => {
    if (event.detail.value === "here") {
      event.detail.insert("@here ")
    }
  })
}

export { mount }

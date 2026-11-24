import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"
import { log } from "../../../shared/web/log"

type Member = { id: number; name: string; email: string }

const members: Member[] = [
  { id: 1, name: "Hollis Grant", email: "hollis@example.com" },
  { id: 2, name: "Inès Moreau", email: "ines@example.com" },
  { id: 3, name: "Kofi Mensah", email: "kofi@example.com" },
  { id: 4, name: "Wren Takahashi", email: "wren@example.com" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Assignee</ui-field-label>
      <ui-select name="assignee" placeholder="Unassigned">
        <ui-select-trigger>
          <button>
            <ui-select-value></ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${members
            .map(
              (member) => `
                <ui-select-item>
                  <span data-slot="stack">
                    ${member.name}
                    <span data-slot="hint">${member.email}</span>
                  </span>
                  <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  const select = root.querySelector("ui-select")!
  select.itemToValue = (member) => String((member as Member).id)
  select.itemToLabel = (member) => (member as Member).name
  select.isItemEqualToValue = (item, value) =>
    (item as Member).id === (value as Member).id
  root
    .querySelectorAll("ui-select-item")
    .forEach((item, index) => (item.value = members[index]))
  select.value = { ...members[1] }
  select.addEventListener("valuechange", (event) => {
    const member = event.detail.value as Member | null
    log(root, `Submits assignee=${member ? member.id : ""}`)
  })
}

export { mount }

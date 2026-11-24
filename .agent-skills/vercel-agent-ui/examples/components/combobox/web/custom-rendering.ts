import "@ui-sdk/web/combobox"
import { Check, ChevronDown, ChevronUp, createElement, Search } from "lucide"

const users = [
  { id: 1, name: "Hollis Grant", username: "hollis", role: "Owner" },
  { id: 2, name: "Inès Moreau", username: "ines", role: "Admin" },
  { id: 3, name: "Kofi Mensah", username: "kofi", role: "Member" },
  { id: 4, name: "Wren Takahashi", username: "wren", role: "Member" },
  { id: 5, name: "Tomasz Wójcik", username: "tomasz", role: "Guest" },
]

const chevron = (open: boolean) =>
  createElement(open ? ChevronUp : ChevronDown, { "aria-hidden": "true" })
    .outerHTML

const mark = (item: Element) =>
  item.hasAttribute("data-selected")
    ? createElement(Check, { "aria-hidden": "true" }).outerHTML
    : item.hasAttribute("data-highlighted")
      ? `<kbd data-slot="kbd">Enter</kbd>`
      : ""

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-combobox>
      <div data-slot="stack">
        <ui-combobox-label>Assignee</ui-combobox-label>
        <div data-slot="row">
          <div data-slot="row">
            ${createElement(Search, { "aria-hidden": "true" }).outerHTML}
            <ui-combobox-input>
              <input placeholder="Search people…" />
            </ui-combobox-input>
          </div>
          <ui-combobox-trigger>
            <button aria-label="Show people">${chevron(false)}</button>
          </ui-combobox-trigger>
        </div>
      </div>
      <ui-combobox-content hidden>
        <ui-combobox-empty>No one by that name.</ui-combobox-empty>
        <ui-combobox-list>
          ${users
            .map(
              (user) => `
                <ui-combobox-item value="${user.username}" label="${user.name}" keywords="${user.username}">
                  <span data-slot="badge">${user.name.slice(0, 1)}</span>
                  <span data-slot="stack">
                    ${user.name}
                    <span data-slot="hint">@${user.username}</span>
                  </span>
                </ui-combobox-item>
              `
            )
            .join("")}
        </ui-combobox-list>
      </ui-combobox-content>
    </ui-combobox>
  `
  const update = (el: Element) => {
    if (el.localName === "button") {
      el.innerHTML = chevron(el.hasAttribute("data-open"))
    }
    if (el.localName !== "ui-combobox-item") {
      return
    }
    el.querySelector(":scope > svg, :scope > kbd")?.remove()
    el.insertAdjacentHTML("beforeend", mark(el))
  }
  const observer = new MutationObserver((records) =>
    records.forEach((record) => update(record.target as Element))
  )
  observer.observe(root.querySelector("ui-combobox-trigger")!, {
    subtree: true,
    attributeFilter: ["data-open"],
  })
  observer.observe(root.querySelector("ui-combobox-list")!, {
    subtree: true,
    attributeFilter: ["data-selected", "data-highlighted"],
  })
}

export { mount }

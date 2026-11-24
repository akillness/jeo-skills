import "@ui-sdk/web/field"
import "@ui-sdk/web/select"
import { Check, ChevronDown, createElement } from "lucide"

const members = [
  { value: "hollis", name: "Hollis Grant", email: "hollis@example.com" },
  { value: "ines", name: "Inès Moreau", email: "ines@example.com" },
  { value: "kofi", name: "Kofi Mensah", email: "kofi@example.com" },
  { value: "wren", name: "Wren Takahashi", email: "wren@example.com" },
]

const valueContent = (value: unknown) => {
  const label = members.find((member) => member.value === value)?.name ?? ""
  return `<span data-slot="badge">${label.slice(0, 1)}</span>${label}`
}

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Reviewer</ui-field-label>
      <ui-select default-value="hollis">
        <ui-select-trigger>
          <button>
            <ui-select-value>${valueContent("hollis")}</ui-select-value>
            ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
          </button>
        </ui-select-trigger>
        <ui-select-content>
          ${members
            .map(
              (member) => `
                <ui-select-item value="${member.value}" label="${member.name}"${member.value === "wren" ? " disabled" : ""}>
                  <span data-slot="badge">${member.name.slice(0, 1)}</span>
                  <span data-slot="stack">
                    ${member.name}
                    <span data-slot="hint">${member.value === "wren" ? "Out of office" : member.email}</span>
                  </span>
                  <ui-select-item-indicator as-child>
                    <span>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</span>
                  </ui-select-item-indicator>
                </ui-select-item>
              `
            )
            .join("")}
        </ui-select-content>
      </ui-select>
    </ui-field>
  `
  const value = root.querySelector("ui-select-value")!
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    value.innerHTML = valueContent(event.detail.value)
  })
}

export { mount }

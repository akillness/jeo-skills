import "@ui-sdk/web/token-input"
import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { createElement, X } from "lucide"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Message</ui-field-label>
      <ui-token-input>
        <ui-token-input-editor placeholder="Type @ to mention someone…"></ui-token-input-editor>
        <template>
          <ui-token-input-token>
            <span data-token-label></span>
            <ui-token-input-token-remove>${createElement(X, { "aria-hidden": "true" }).outerHTML}</ui-token-input-token-remove>
          </ui-token-input-token>
        </template>
        <ui-trigger-menu>
          <ui-trigger-menu-content>
            <ui-trigger-menu-list></ui-trigger-menu-list>
          </ui-trigger-menu-content>
        </ui-trigger-menu>
      </ui-token-input>
    </ui-field>
  `
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", type: "mention", items: people },
  ]
}

export { mount }

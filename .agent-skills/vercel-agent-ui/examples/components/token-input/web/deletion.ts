import "@ui-sdk/web/token-input"
import "@ui-sdk/web/select"
import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import type { TokenDeletion, TokenInputValue } from "@ui-sdk/web/token-input"
import { Check, ChevronDown, createElement, File } from "lucide"
import { log } from "../../../shared/web/log"

const modes = [
  { value: "whole", label: "Whole" },
  { value: "select", label: "Select" },
  { value: "revert", label: "Revert" },
]

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
  { value: "package.json", label: "package.json" },
]

const draft: TokenInputValue = [
  "Explain ",
  {
    type: "file",
    value: "src/routes.ts",
    label: "routes.ts",
    data: { trigger: "@" },
  },
  " in two sentences.",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <ui-select default-value="whole">
          <ui-select-label>Backspace</ui-select-label>
          <ui-select-trigger>
            <button>
              <ui-select-value></ui-select-value>
              ${createElement(ChevronDown, { "aria-hidden": "true" }).outerHTML}
            </button>
          </ui-select-trigger>
          <ui-select-content>
            ${modes
              .map(
                (mode) => `
                  <ui-select-item value="${mode.value}">
                    ${mode.label}
                    <ui-select-item-indicator>${createElement(Check, { "aria-hidden": "true" }).outerHTML}</ui-select-item-indicator>
                  </ui-select-item>
                `
              )
              .join("")}
          </ui-select-content>
        </ui-select>
      </div>
      <ui-field>
        <ui-field-label>Prompt</ui-field-label>
      </ui-field>
    </div>
  `
  const prompt = document.createElement("ui-token-input")
  prompt.tokenDeletion = "whole"
  prompt.defaultValue = draft
  prompt.innerHTML = `
    <ui-token-input-editor></ui-token-input-editor>
    <template>
      <ui-token-input-token>
        ${createElement(File, { "aria-hidden": "true" }).outerHTML}
        <span data-token-label></span>
      </ui-token-input-token>
    </template>
    <ui-trigger-menu>
      <ui-trigger-menu-content>
        <ui-trigger-menu-list></ui-trigger-menu-list>
      </ui-trigger-menu-content>
    </ui-trigger-menu>
  `
  root.querySelector("ui-field")!.append(prompt)
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", type: "file", items: files },
  ]
  root.querySelector("ui-select")!.addEventListener("valuechange", (event) => {
    if (event.detail.value) {
      prompt.tokenDeletion = event.detail.value as TokenDeletion
    }
  })
  prompt.addEventListener("valuechange", (event) => {
    for (const token of event.detail.removed) {
      log(root, `Removed ${token.label} (${prompt.tokenDeletion})`)
    }
  })
}

export { mount }

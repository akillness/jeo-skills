import "@ui-sdk/web/trigger-menu"
import "@ui-sdk/web/field"
import { toText, type TokenInputValue } from "@ui-sdk/web/token-input"
import { log } from "../../../shared/web/log"

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
  { value: "package.json", label: "package.json" },
]

const draft: TokenInputValue = [
  "Explain ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " in two sentences.",
]

function mount(root: HTMLElement) {
  root.innerHTML = `
    <ui-field>
      <ui-field-label>Prompt</ui-field-label>
      <ui-token-input value="${toText(draft)}">
        <ui-token-input-editor></ui-token-input-editor>
        <ui-trigger-menu>
          <ui-trigger-menu-content>
            <ui-trigger-menu-list></ui-trigger-menu-list>
          </ui-trigger-menu-content>
        </ui-trigger-menu>
      </ui-token-input>
    </ui-field>
  `
  const prompt = root.querySelector("ui-token-input")!
  prompt.history = { limit: 50, groupDelay: 1000 }
  prompt.getTokenDescription = (token) =>
    token.type === "file" ? "attached file" : token.type
  root.querySelector("ui-trigger-menu")!.triggers = [
    { char: "@", type: "file", items: files },
  ]
  prompt.addEventListener("valuechange", (event) => {
    const { value, reason } = event.detail
    const removed = event.detail.removed.map((token) => token.label).join(", ")
    log(
      root,
      `${toText(value)} (${reason}${removed ? `, removed ${removed}` : ""})`
    )
  })
}

export { mount }

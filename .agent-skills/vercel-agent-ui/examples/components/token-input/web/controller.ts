import "@ui-sdk/web/field"
import {
  toText,
  type Token,
  type TokenInputValue,
} from "@ui-sdk/web/token-input"

const draft: TokenInputValue = [
  "Compare ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " with ",
]

const loadFile = () => new Promise<void>((resolve) => setTimeout(resolve, 800))

function mount(root: HTMLElement) {
  root.innerHTML = `
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" data-action="attach">Attach File</button>
        <button type="button" data-action="path">Show Path</button>
        <button type="button" data-action="remove">Remove First</button>
        <button type="button" data-action="undo">Undo</button>
        <button type="button" data-action="clear">Clear</button>
      </div>
      <ui-field>
        <ui-field-label>Prompt</ui-field-label>
        <ui-token-input value="${toText(draft)}">
          <ui-token-input-editor></ui-token-input-editor>
        </ui-token-input>
      </ui-field>
    </div>
  `
  const prompt = root.querySelector("ui-token-input")!.api
  const firstToken = () =>
    prompt
      .getValue()
      .find((segment): segment is Token => typeof segment !== "string")
  const actions: Record<string, () => void> = {
    attach: () =>
      prompt.insert(
        { type: "file", value: "package.json", label: "package.json" },
        { at: "end", resolve: loadFile() }
      ),
    path: () => {
      const token = firstToken()
      if (token) {
        prompt.updateToken(token.id!, { label: token.value })
      }
    },
    remove: () => {
      const token = firstToken()
      if (token) {
        prompt.removeToken(token.id!)
      }
    },
    undo: () => prompt.undo(),
    clear: () => prompt.clear(),
  }
  root
    .querySelector("[data-slot=controls]")!
    .addEventListener("mousedown", (event) => event.preventDefault())
  root
    .querySelectorAll<HTMLButtonElement>("[data-action]")
    .forEach((button) => {
      button.addEventListener("click", () => actions[button.dataset.action!]())
    })
}

export { mount }

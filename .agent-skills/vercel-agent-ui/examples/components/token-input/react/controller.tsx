import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  createTokenInputController,
  TokenInput,
  TokenInputEditor,
  type Token,
  type TokenInputValue,
} from "@ui-sdk/react/token-input"
import * as React from "react"

const draft: TokenInputValue = [
  "Compare ",
  { type: "file", value: "src/routes.ts", label: "routes.ts" },
  " with ",
]

const loadFile = () => new Promise<void>((resolve) => setTimeout(resolve, 800))

function Example() {
  const [prompt] = React.useState(createTokenInputController)
  const firstToken = () =>
    prompt
      .getValue()
      .find((segment): segment is Token => typeof segment !== "string")

  return (
    <div data-slot="stack">
      <div data-slot="controls" onMouseDown={(event) => event.preventDefault()}>
        <button
          type="button"
          onClick={() =>
            prompt.insert(
              { type: "file", value: "package.json", label: "package.json" },
              { at: "end", resolve: loadFile() }
            )
          }
        >
          Attach File
        </button>
        <button
          type="button"
          onClick={() => {
            const token = firstToken()
            if (token) {
              prompt.updateToken(token.id!, { label: token.value })
            }
          }}
        >
          Show Path
        </button>
        <button
          type="button"
          onClick={() => {
            const token = firstToken()
            if (token) {
              prompt.removeToken(token.id!)
            }
          }}
        >
          Remove First
        </button>
        <button type="button" onClick={() => prompt.undo()}>
          Undo
        </button>
        <button type="button" onClick={() => prompt.clear()}>
          Clear
        </button>
      </div>
      <Field>
        <FieldLabel>Prompt</FieldLabel>
        <TokenInput controller={prompt} defaultValue={draft}>
          <TokenInputEditor />
        </TokenInput>
      </Field>
    </div>
  )
}

export { Example }

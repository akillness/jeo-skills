import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  toText,
  TokenInput,
  TokenInputEditor,
  type TokenInputValue,
} from "@ui-sdk/solid/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/solid/trigger-menu"
import { createSignal, For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

function Example() {
  const log = useLog()
  const [value, setValue] = createSignal<TokenInputValue>(draft)

  return (
    <Field>
      <FieldLabel>Prompt</FieldLabel>
      <TokenInput
        value={value()}
        onValueChange={(next, details) => {
          setValue(next)
          const removed = details.removed.map((token) => token.label).join(", ")
          log(
            `${toText(next)} (${details.reason}${removed ? `, removed ${removed}` : ""})`
          )
        }}
        history={{ limit: 50, groupDelay: 1000 }}
        getTokenDescription={(token) =>
          token.type === "file" ? "attached file" : token.type
        }
      >
        <TokenInputEditor />
        <TriggerMenu triggers={[{ char: "@", type: "file", items: files }]}>
          <TriggerMenuContent>
            <TriggerMenuList>
              {(state) => (
                <For each={state.items as TriggerMenuDataItem[]}>
                  {(item) => (
                    <TriggerMenuItem value={item.value} label={item.label}>
                      {item.label}
                    </TriggerMenuItem>
                  )}
                </For>
              )}
            </TriggerMenuList>
          </TriggerMenuContent>
        </TriggerMenu>
      </TokenInput>
    </Field>
  )
}

export { Example }

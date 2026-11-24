import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  toText,
  TokenInput,
  TokenInputEditor,
  type TokenInputValue,
} from "@ui-sdk/react/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/react/trigger-menu"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

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
  const [value, setValue] = React.useState<TokenInputValue>(draft)

  return (
    <Field>
      <FieldLabel>Prompt</FieldLabel>
      <TokenInput
        value={value}
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
              {(state) =>
                (state.items as TriggerMenuDataItem[]).map((item) => (
                  <TriggerMenuItem
                    key={item.value}
                    value={item.value}
                    label={item.label}
                  >
                    {item.label}
                  </TriggerMenuItem>
                ))
              }
            </TriggerMenuList>
          </TriggerMenuContent>
        </TriggerMenu>
      </TokenInput>
    </Field>
  )
}

export { Example }

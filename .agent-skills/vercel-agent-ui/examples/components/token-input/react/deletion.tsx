import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/react/select"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  type TokenDeletion,
  type TokenInputValue,
} from "@ui-sdk/react/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/react/trigger-menu"
import { CheckIcon, ChevronDownIcon, FileIcon } from "lucide-react"
import * as React from "react"
import { useLog } from "../../../shared/react/log"

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

function Example() {
  const log = useLog()
  const [deletion, setDeletion] = React.useState<TokenDeletion>("whole")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={deletion}
          onValueChange={(next) => next && setDeletion(next as TokenDeletion)}
        >
          <SelectLabel>Backspace</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <ChevronDownIcon aria-hidden="true" />
          </SelectTrigger>
          <SelectContent>
            {modes.map((mode) => (
              <SelectItem key={mode.value} value={mode.value}>
                {mode.label}
                <SelectItemIndicator>
                  <CheckIcon aria-hidden="true" />
                </SelectItemIndicator>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Field>
        <FieldLabel>Prompt</FieldLabel>
        <TokenInput
          tokenDeletion={deletion}
          defaultValue={draft}
          renderToken={(token) => (
            <TokenInputToken>
              <FileIcon aria-hidden="true" />
              {token.label}
            </TokenInputToken>
          )}
          onValueChange={(value, details) => {
            for (const token of details.removed) {
              log(`Removed ${token.label} (${deletion})`)
            }
          }}
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
    </div>
  )
}

export { Example }

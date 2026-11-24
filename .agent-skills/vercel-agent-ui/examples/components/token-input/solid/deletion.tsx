import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  type TokenDeletion,
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
  const [deletion, setDeletion] = createSignal<TokenDeletion>("whole")

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <Select
          items={modes}
          value={deletion()}
          onValueChange={(next) => next && setDeletion(next as TokenDeletion)}
        >
          <SelectLabel>Backspace</SelectLabel>
          <SelectTrigger>
            <SelectValue />
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </SelectTrigger>
          <SelectContent>
            <For each={modes}>
              {(mode) => (
                <SelectItem value={mode.value}>
                  {mode.label}
                  <SelectItemIndicator>
                    <svg
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                  </SelectItemIndicator>
                </SelectItem>
              )}
            </For>
          </SelectContent>
        </Select>
      </div>
      <Field>
        <FieldLabel>Prompt</FieldLabel>
        <TokenInput
          tokenDeletion={deletion()}
          defaultValue={draft}
          renderToken={(token) => (
            <TokenInputToken>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z" />
                <path d="M14 2v5a1 1 0 0 0 1 1h5" />
              </svg>
              {token.label}
            </TokenInputToken>
          )}
          onValueChange={(value, details) => {
            for (const token of details.removed) {
              log(`Removed ${token.label} (${deletion()})`)
            }
          }}
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
    </div>
  )
}

export { Example }

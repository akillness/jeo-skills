import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
} from "@ui-sdk/solid/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/solid/trigger-menu"
import { For } from "solid-js"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Message</FieldLabel>
      <TokenInput
        renderToken={(token) => (
          <TokenInputToken>
            {token.label}
            <TokenInputTokenRemove>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </TokenInputTokenRemove>
          </TokenInputToken>
        )}
      >
        <TokenInputEditor placeholder="Type @ to mention someone…" />
        <TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
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

import { Field, FieldLabel } from "@ui-sdk/react/field"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
} from "@ui-sdk/react/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/react/trigger-menu"
import { XIcon } from "lucide-react"

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
              <XIcon aria-hidden="true" />
            </TokenInputTokenRemove>
          </TokenInputToken>
        )}
      >
        <TokenInputEditor placeholder="Type @ to mention someone…" />
        <TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
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

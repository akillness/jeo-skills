"use client"

import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  TriggerMenuStatus,
} from "@ui-sdk/react/trigger-menu"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  return (
    <TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={<TriggerMenuInput placeholder="Type @ to mention someone…" />}
        />
      </Field>
      <div data-slot="visually-hidden">
        <TriggerMenuStatus />
      </div>
      <TriggerMenuContent>
        <TriggerMenuEmpty>No one found</TriggerMenuEmpty>
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
  )
}

export { Example }

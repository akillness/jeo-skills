"use client"

import { Field, FieldControl, FieldLabel } from "@ui-sdk/react/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/react/trigger-menu"
import * as React from "react"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  const [field, setField] = React.useState<HTMLDivElement | null>(null)
  return (
    <TriggerMenu triggers={[{ char: "@", items: people }]}>
      <Field ref={setField}>
        <FieldLabel>Comment</FieldLabel>
        <FieldControl
          render={<TriggerMenuInput placeholder="Type @ to mention someone…" />}
        />
      </Field>
      <TriggerMenuContent
        side="top"
        align="start"
        sideOffset={8}
        alignOffset={-5}
        collisionPadding={16}
        anchor={field}
        container={field}
        keepMounted
      >
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

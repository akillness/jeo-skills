import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  TriggerMenuStatus,
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
    <TriggerMenu triggers={[{ char: "@", type: "mention", items: people }]}>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput
              {...props}
              placeholder="Type @ to mention someone…"
            />
          )}
        />
      </Field>
      <div data-slot="visually-hidden">
        <TriggerMenuStatus />
      </div>
      <TriggerMenuContent>
        <TriggerMenuEmpty>No one found</TriggerMenuEmpty>
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
  )
}

export { Example }

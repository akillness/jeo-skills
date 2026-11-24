import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
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
    <TriggerMenu
      triggers={[{ char: "@", items: people }]}
      autoHighlight={false}
      loop={false}
    >
      <Field>
        <FieldLabel>Task</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput
              {...props}
              render={(inputProps) => <input {...inputProps} />}
              placeholder="Type @ to assign someone…"
            />
          )}
        />
      </Field>
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
  )
}

export { Example }

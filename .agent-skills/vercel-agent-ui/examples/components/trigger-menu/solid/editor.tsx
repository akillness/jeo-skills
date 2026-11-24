import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  type TextEditorAdapter,
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
  textFieldAdapter,
} from "@ui-sdk/solid/trigger-menu"
import { createSignal, For } from "solid-js"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  const [editor, setEditor] = createSignal<TextEditorAdapter>()

  return (
    <TriggerMenu editor={editor()} triggers={[{ char: "@", items: people }]}>
      <Field>
        <FieldLabel>Notes</FieldLabel>
        <FieldControl
          ref={(field) => setEditor(textFieldAdapter(field))}
          render={(props) => (
            <textarea {...props} placeholder="Type @ to mention someone…" />
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

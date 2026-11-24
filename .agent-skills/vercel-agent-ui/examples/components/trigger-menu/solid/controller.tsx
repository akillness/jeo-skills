import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  createTriggerMenuController,
} from "@ui-sdk/solid/trigger-menu"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

function Example() {
  const log = useLog()
  const menu = createTriggerMenuController()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={async () => {
            const closed = await menu.open({ trigger: "@" })
            log(`Closed (${closed.reason})`)
          }}
        >
          Mention
        </button>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() =>
            menu.insert(
              new Date().toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
              })
            )
          }
        >
          Insert Date
        </button>
      </div>
      <TriggerMenu controller={menu} triggers={[{ char: "@", items: people }]}>
        <Field>
          <FieldLabel>Message</FieldLabel>
          <FieldControl
            render={(props) => (
              <TriggerMenuInput {...props} placeholder="Write a message…" />
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
    </div>
  )
}

export { Example }

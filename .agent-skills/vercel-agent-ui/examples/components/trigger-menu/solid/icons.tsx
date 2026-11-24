import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
} from "@ui-sdk/solid/trigger-menu"
import { For } from "solid-js"

const icon = (markup: string) => () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    innerHTML={markup}
  />
)
const Reply = icon(
  '<path d="M20 18v-2a4 4 0 0 0-4-4H4" /><path d="m9 17-5-5 5-5" />'
)
const Clock = icon('<circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" />')
const Search = icon(
  '<path d="m21 21-4.34-4.34" /><circle cx="11" cy="11" r="8" />'
)
const Share = icon(
  '<path d="M12 2v13" /><path d="m16 6-4-4-4 4" /><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />'
)
const Trash = icon(
  '<path d="M10 11v6" /><path d="M14 11v6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M3 6h18" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />'
)

const commands = [
  { value: "reply", icon: Reply, mirror: true },
  { value: "remind", icon: Clock },
  { value: "search", icon: Search },
  { value: "share", icon: Share },
  { value: "clear", icon: Trash },
]

function Example() {
  return (
    <TriggerMenu triggers={[{ char: "/", boundary: "start", type: "command" }]}>
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput {...props} placeholder="Type / for commands…" />
          )}
        />
      </Field>
      <TriggerMenuContent>
        <TriggerMenuList>
          <For each={commands}>
            {(command) => (
              <TriggerMenuItem value={command.value}>
                <TriggerMenuItemIcon mirror={command.mirror}>
                  <command.icon />
                </TriggerMenuItemIcon>
                {command.value}
              </TriggerMenuItem>
            )}
          </For>
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  )
}

export { Example }

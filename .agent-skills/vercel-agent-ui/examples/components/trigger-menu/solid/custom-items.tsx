import { Field, FieldControl, FieldLabel } from "@ui-sdk/solid/field"
import {
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuGroup,
  TriggerMenuGroupLabel,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuItemIcon,
  TriggerMenuList,
  TriggerMenuSeparator,
} from "@ui-sdk/solid/trigger-menu"
import { For } from "solid-js"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik", disabled: true },
]

function Example() {
  return (
    <TriggerMenu
      triggers={[
        {
          char: "@",
          spaces: 2,
          maxLength: 30,
          pattern: /[\p{L}.'-]/u,
          filter: "startsWith",
          insert: (item) => `@${item.label.split(" ")[0]} `,
        },
      ]}
    >
      <Field>
        <FieldLabel>Message</FieldLabel>
        <FieldControl
          render={(props) => (
            <TriggerMenuInput
              {...props}
              placeholder="Type @ and a first name…"
            />
          )}
        />
      </Field>
      <TriggerMenuContent>
        <TriggerMenuList>
          <TriggerMenuGroup>
            <TriggerMenuGroupLabel>People</TriggerMenuGroupLabel>
            <For each={people}>
              {(person) => (
                <TriggerMenuItem
                  value={person.value}
                  label={person.label}
                  disabled={person.disabled}
                >
                  {person.label}
                  <span data-slot="hint">
                    {person.disabled ? "Deactivated" : `@${person.value}`}
                  </span>
                </TriggerMenuItem>
              )}
            </For>
          </TriggerMenuGroup>
          <TriggerMenuSeparator />
          <TriggerMenuItem
            value="here"
            label="here"
            keywords={["everyone", "channel"]}
            onSelect={(value, details) => details.insert("@here ")}
          >
            <TriggerMenuItemIcon>
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <path d="M16 3.128a4 4 0 0 1 0 7.744" />
                <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
                <circle cx="9" cy="7" r="4" />
              </svg>
            </TriggerMenuItemIcon>
            Notify everyone here
          </TriggerMenuItem>
        </TriggerMenuList>
      </TriggerMenuContent>
    </TriggerMenu>
  )
}

export { Example }

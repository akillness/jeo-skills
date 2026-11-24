import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { For, Show } from "solid-js"

const members = [
  { value: "hollis", name: "Hollis Grant", email: "hollis@example.com" },
  { value: "ines", name: "Inès Moreau", email: "ines@example.com" },
  { value: "kofi", name: "Kofi Mensah", email: "kofi@example.com" },
  { value: "wren", name: "Wren Takahashi", email: "wren@example.com" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Reviewer</FieldLabel>
      <Select defaultValue="hollis">
        <SelectTrigger
          render={(props) => (
            <button {...props}>
              {props.children}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}
        >
          <SelectValue>
            {(state) => (
              <>
                <span data-slot="badge">{state.label.slice(0, 1)}</span>
                {state.label}
              </>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <For each={members}>
            {(member) => (
              <SelectItem
                value={member.value}
                label={member.name}
                disabled={member.value === "wren"}
              >
                {(state) => (
                  <>
                    <span data-slot="badge">{member.name.slice(0, 1)}</span>
                    <span data-slot="stack">
                      {member.name}
                      <span data-slot="hint">
                        {state.disabled ? "Out of office" : member.email}
                      </span>
                    </span>
                    <SelectItemIndicator
                      render={(props, indicator) => (
                        <span {...props}>
                          <Show when={indicator.selected}>
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              aria-hidden="true"
                            >
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          </Show>
                        </span>
                      )}
                    />
                  </>
                )}
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }

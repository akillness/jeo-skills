import { Field, FieldDescription, FieldLabel } from "@ui-sdk/solid/field"
import {
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/solid/listbox"
import { For } from "solid-js"

const topics = [
  { value: "comments", label: "Comments" },
  { value: "mentions", label: "Mentions" },
  { value: "reactions", label: "Reactions" },
  { value: "sign-ins", label: "New sign-ins" },
  { value: "billing", label: "Billing" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Email me about</FieldLabel>
      <Listbox multiple activation="automatic" defaultValue={["mentions"]}>
        <For each={topics}>
          {(topic) => (
            <ListboxItem value={topic.value}>
              {topic.label}
              <ListboxItemIndicator>
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
              </ListboxItemIndicator>
            </ListboxItem>
          )}
        </For>
      </Listbox>
      <FieldDescription>
        Hold Shift to select a range, or Ctrl or ⌘ to add one.
      </FieldDescription>
    </Field>
  )
}

export { Example }

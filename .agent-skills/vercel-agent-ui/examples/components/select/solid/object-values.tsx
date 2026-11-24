import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

type Member = { id: number; name: string; email: string }

const members: Member[] = [
  { id: 1, name: "Hollis Grant", email: "hollis@example.com" },
  { id: 2, name: "Inès Moreau", email: "ines@example.com" },
  { id: 3, name: "Kofi Mensah", email: "kofi@example.com" },
  { id: 4, name: "Wren Takahashi", email: "wren@example.com" },
]

function Example() {
  const log = useLog()

  return (
    <Field>
      <FieldLabel>Assignee</FieldLabel>
      <Select
        defaultValue={{ ...members[1] }}
        onValueChange={(member) =>
          log(`Submits assignee=${member ? member.id : ""}`)
        }
        name="assignee"
        itemToValue={(member) => String(member.id)}
        itemToLabel={(member) => member.name}
        isItemEqualToValue={(item, value) => item.id === value.id}
        placeholder="Unassigned"
      >
        <SelectTrigger>
          <SelectValue />
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
        </SelectTrigger>
        <SelectContent>
          <For each={members}>
            {(member) => (
              <SelectItem value={member}>
                <span data-slot="stack">
                  {member.name}
                  <span data-slot="hint">{member.email}</span>
                </span>
                <SelectItemIndicator>
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
                </SelectItemIndicator>
              </SelectItem>
            )}
          </For>
        </SelectContent>
      </Select>
    </Field>
  )
}

export { Example }

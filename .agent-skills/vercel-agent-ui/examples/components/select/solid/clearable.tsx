import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectClear,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
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

  return (
    <Field>
      <FieldLabel>Assignee</FieldLabel>
      <Select
        defaultValue="ines"
        placeholder="Unassigned"
        onValueChange={(value, details) =>
          log(`value: ${JSON.stringify(value)} (${details.reason})`)
        }
      >
        <div data-slot="row">
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
          <SelectClear aria-label="Clear assignee">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
              aria-hidden="true"
            >
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </svg>
          </SelectClear>
        </div>
        <SelectContent>
          <For each={people}>
            {(person) => (
              <SelectItem value={person.value}>
                {person.label}
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

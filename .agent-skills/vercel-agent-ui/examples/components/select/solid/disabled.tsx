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

const countries = [
  { value: "ca", label: "Canada" },
  { value: "dk", label: "Denmark" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
]

const fields = [
  { label: "Billing country", disabled: true },
  { label: "Shipping from", readOnly: true },
  { label: "Shipping to" },
]

function Example() {
  return (
    <div data-slot="stack">
      <For each={fields}>
        {(field) => (
          <Field>
            <FieldLabel>{field.label}</FieldLabel>
            <Select
              defaultValue={field.disabled || field.readOnly ? "fr" : null}
              placeholder="Select a country"
              disabled={field.disabled}
              readOnly={field.readOnly}
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
                <For each={countries}>
                  {(country) => (
                    <SelectItem
                      value={country.value}
                      disabled={country.value === "dk"}
                    >
                      {country.label}
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
        )}
      </For>
    </div>
  )
}

export { Example }

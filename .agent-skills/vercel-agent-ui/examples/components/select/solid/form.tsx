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

const countries = [
  { value: "au", label: "Australia" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
]

const topics = ["Design", "Engineering", "Marketing", "Research", "Sales"]

const frequencies = ["Daily", "Weekly", "Monthly"]

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <form
        id="select-newsletter"
        data-slot="stack"
        onSubmit={(event) => {
          event.preventDefault()
          const entries = [...new FormData(event.currentTarget)].map(
            ([name, value]) => `${name}=${value}`
          )
          log(`Submitted ${entries.join("&")}`)
        }}
      >
        <Field>
          <FieldLabel>Country</FieldLabel>
          <Select
            name="country"
            autoComplete="country"
            required
            placeholder="Select a country"
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
                  <SelectItem value={country.value}>
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
        <Field>
          <FieldLabel>Topics</FieldLabel>
          <Select name="topics" multiple defaultValue={["Design"]}>
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
              <For each={topics}>
                {(topic) => (
                  <SelectItem value={topic}>
                    {topic}
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
      </form>
      <Field>
        <FieldLabel>Frequency</FieldLabel>
        <Select name="frequency" form="select-newsletter" defaultValue="Weekly">
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
            <For each={frequencies}>
              {(frequency) => (
                <SelectItem value={frequency}>
                  {frequency}
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
      <div data-slot="row">
        <button type="submit" form="select-newsletter" data-variant="solid">
          Save
        </button>
        <button type="reset" form="select-newsletter">
          Reset
        </button>
      </div>
    </div>
  )
}

export { Example }

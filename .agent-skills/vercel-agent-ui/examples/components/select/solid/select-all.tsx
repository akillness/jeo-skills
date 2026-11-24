import { Field, FieldLabel } from "@ui-sdk/solid/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectSelectAll,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/solid/select"
import { For, Show } from "solid-js"

const regions = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "europe", label: "Europe" },
  { value: "asia-pacific", label: "Asia Pacific" },
  { value: "south-america", label: "South America" },
]

function Example() {
  return (
    <Field>
      <FieldLabel>Regions</FieldLabel>
      <Select
        multiple
        defaultValue={["us-east", "europe", "asia-pacific"]}
        placeholder="Select regions"
      >
        <SelectTrigger>
          <SelectValue
            maxLabels={2}
            getMoreLabel={(count) => `${count} more`}
          />
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
          <SelectSelectAll>
            {(state) => (
              <>
                Select all
                <Show when={state.checked}>
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
                <Show when={state.indeterminate}>
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="2"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M5 12h14" />
                  </svg>
                </Show>
              </>
            )}
          </SelectSelectAll>
          <SelectSeparator />
          <For each={regions}>
            {(region) => (
              <SelectItem value={region.value}>
                {region.label}
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

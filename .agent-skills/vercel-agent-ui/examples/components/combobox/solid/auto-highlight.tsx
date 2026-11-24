import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxLabel,
  ComboboxList,
  ComboboxTrigger,
} from "@ui-sdk/solid/combobox"
import { For } from "solid-js"

const countries = [
  { value: "ar", label: "Argentina" },
  { value: "au", label: "Australia" },
  { value: "at", label: "Austria" },
  { value: "be", label: "Belgium" },
  { value: "br", label: "Brazil" },
  { value: "ca", label: "Canada" },
  { value: "cl", label: "Chile" },
  { value: "dk", label: "Denmark" },
  { value: "fi", label: "Finland" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "gr", label: "Greece" },
  { value: "jp", label: "Japan" },
  { value: "nl", label: "Netherlands" },
  { value: "es", label: "Spain" },
  { value: "se", label: "Sweden" },
  { value: "ch", label: "Switzerland" },
]

function Example() {
  return (
    <Combobox autoHighlight>
      <div data-slot="stack">
        <ComboboxLabel>Country</ComboboxLabel>
        <div data-slot="row">
          <ComboboxInput placeholder="Type “sw” and press Enter" />
          <ComboboxTrigger aria-label="Show countries">
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
          </ComboboxTrigger>
        </div>
      </div>
      <ComboboxContent>
        <ComboboxEmpty>No countries found.</ComboboxEmpty>
        <ComboboxList>
          <For each={countries}>
            {(country) => (
              <ComboboxItem value={country.value} label={country.label}>
                {country.label}
                <ComboboxItemIndicator>
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
                </ComboboxItemIndicator>
              </ComboboxItem>
            )}
          </For>
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}

export { Example }

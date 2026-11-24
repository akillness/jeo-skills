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
  createComboboxController,
} from "@ui-sdk/react/combobox"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useLog } from "../../../shared/react/log"
import * as React from "react"

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

const countryLabel = (value: string) =>
  countries.find((country) => country.value === value)?.label ?? value

const country = createComboboxController<string>()

function Example() {
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button
          type="button"
          onClick={async () => {
            const { reason } = await country.open()
            log(`Closed by ${reason}, with ${country.getValue() ?? "nothing"}`)
          }}
        >
          Open and Wait
        </button>
        <button
          type="button"
          onClick={() => {
            country.focus()
            country.setQuery("sw")
            country.open()
          }}
        >
          Search “sw”
        </button>
        <button type="button" onClick={() => country.setValue("de")}>
          Choose Germany
        </button>
        <button type="button" onClick={() => country.clear()}>
          Clear
        </button>
      </div>
      <Combobox controller={country} itemToLabel={countryLabel}>
        <div data-slot="stack">
          <ComboboxLabel>Country</ComboboxLabel>
          <div data-slot="row">
            <ComboboxInput placeholder="Search countries…" />
            <ComboboxTrigger aria-label="Show countries">
              <ChevronDownIcon />
            </ComboboxTrigger>
          </div>
        </div>
        <ComboboxContent>
          <ComboboxEmpty>No countries found.</ComboboxEmpty>
          <ComboboxList>
            {countries.map((item) => (
              <ComboboxItem
                key={item.value}
                value={item.value}
                label={item.label}
              >
                {item.label}
                <ComboboxItemIndicator>
                  <CheckIcon />
                </ComboboxItemIndicator>
              </ComboboxItem>
            ))}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
    </div>
  )
}

export { Example }

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

function Example() {
  const [value, setValue] = React.useState<string | null>("fr")
  const [query, setQuery] = React.useState("France")
  const [open, setOpen] = React.useState(false)
  const log = useLog()

  return (
    <div data-slot="stack">
      <div data-slot="controls">
        <button type="button" onClick={() => setValue("jp")}>
          Choose Japan
        </button>
        <button type="button" onClick={() => setOpen(true)}>
          Open
        </button>
      </div>
      <Combobox
        value={value}
        onValueChange={(next, details) => {
          setValue(next)
          log(`value: ${next} (${details.reason})`)
        }}
        query={query}
        onQueryChange={(next, details) => {
          setQuery(next)
          log(`query: “${next}” (${details.reason})`)
        }}
        open={open}
        onOpenChange={(next, details) => {
          setOpen(next)
          log(`open: ${next} (${details.reason})`)
        }}
        itemToLabel={countryLabel}
        debug
      >
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
            {countries.map((country) => (
              <ComboboxItem
                key={country.value}
                value={country.value}
                label={country.label}
              >
                {country.label}
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

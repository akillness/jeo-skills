import {
  Combobox,
  ComboboxChip,
  ComboboxChipRemove,
  ComboboxChips,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxItemIndicator,
  ComboboxList,
  ComboboxTrigger,
  ComboboxValue,
} from "@ui-sdk/solid/combobox"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/solid/field"
import { For } from "solid-js"
import { useLog } from "../../../shared/solid/log"

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

const interests = ["Design", "Engineering", "Marketing", "Research", "Sales"]

function Example() {
  const log = useLog()

  return (
    <form
      data-slot="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const entries = [...new FormData(event.currentTarget)].map(
          ([name, value]) => `${name}=${value}`
        )
        log(`Submitted ${entries.join("&")}`)
      }}
    >
      <Field name="country">
        <FieldLabel>Country</FieldLabel>
        <Combobox required itemToLabel={countryLabel}>
          <div data-slot="row">
            <ComboboxInput placeholder="Search countries…" />
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
        <FieldDescription>Where we ship your order.</FieldDescription>
        <div>
          <FieldError match="valueMissing">Choose a country.</FieldError>
        </div>
      </Field>
      <Field name="interests">
        <FieldLabel>Interests</FieldLabel>
        <Combobox multiple defaultValue={["Design"]}>
          <ComboboxChips>
            <ComboboxValue>
              {(state) => (
                <For each={state.value as string[]}>
                  {(interest) => (
                    <ComboboxChip value={interest}>
                      {interest}
                      <ComboboxChipRemove aria-label={`Remove ${interest}`}>
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
                      </ComboboxChipRemove>
                    </ComboboxChip>
                  )}
                </For>
              )}
            </ComboboxValue>
            <ComboboxInput placeholder="Add interests…" />
          </ComboboxChips>
          <ComboboxContent>
            <ComboboxList>
              <For each={interests}>
                {(interest) => (
                  <ComboboxItem value={interest}>
                    {interest}
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
      </Field>
      <div data-slot="row">
        <button type="submit">Submit</button>
        <button type="reset">Reset</button>
      </div>
    </form>
  )
}

export { Example }

import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/solid/autocomplete"
import { For } from "solid-js"

const cities = ["القاهرة", "القدس", "الرباط", "الرياض", "بيروت", "دبي", "عمّان"]

export function Example() {
  return (
    <div dir="rtl">
      <Autocomplete inlineComplete>
        <div data-slot="stack">
          <AutocompleteLabel>المدينة</AutocompleteLabel>
          <AutocompleteInput placeholder="مثلاً: دبي" />
        </div>
        <AutocompleteContent>
          <AutocompleteList>
            <For each={cities}>
              {(city) => (
                <AutocompleteItem value={city}>{city}</AutocompleteItem>
              )}
            </For>
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

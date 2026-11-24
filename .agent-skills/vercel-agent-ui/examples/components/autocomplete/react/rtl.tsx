import {
  Autocomplete,
  AutocompleteContent,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteLabel,
  AutocompleteList,
} from "@ui-sdk/react/autocomplete"

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
            {cities.map((city) => (
              <AutocompleteItem key={city} value={city}>
                {city}
              </AutocompleteItem>
            ))}
          </AutocompleteList>
        </AutocompleteContent>
      </Autocomplete>
    </div>
  )
}

<script lang="ts">
  import { ChevronDownIcon, XIcon } from "@lucide/svelte"
  import {
    Autocomplete,
    AutocompleteClear,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
    AutocompleteTrigger,
  } from "@ui-sdk/svelte/autocomplete"

  const fruits = [
    "Apple",
    "Apricot",
    "Avocado",
    "Banana",
    "Blackberry",
    "Blueberry",
    "Cherry",
    "Grape",
    "Lemon",
    "Mango",
    "Orange",
    "Peach",
    "Pear",
    "Pineapple",
    "Strawberry",
  ]
</script>

<Autocomplete defaultValue="Mango">
  <div data-slot="stack">
    <AutocompleteLabel>Fruit</AutocompleteLabel>
    <div data-slot="row">
      <AutocompleteInput />
      <AutocompleteClear aria-label="Clear">
        <XIcon aria-hidden="true" />
      </AutocompleteClear>
      <AutocompleteTrigger aria-label="Show fruits">
        <ChevronDownIcon aria-hidden="true" />
      </AutocompleteTrigger>
    </div>
  </div>
  <AutocompleteContent>
    <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each fruits as fruit (fruit)}
        <AutocompleteItem value={fruit}>
          {fruit}
        </AutocompleteItem>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>

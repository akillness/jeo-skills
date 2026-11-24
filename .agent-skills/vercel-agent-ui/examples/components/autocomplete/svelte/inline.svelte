<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
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

<Autocomplete inlineComplete>
  <div data-slot="stack">
    <AutocompleteLabel>Fruit</AutocompleteLabel>
    <AutocompleteInput placeholder="Type “bl”" />
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

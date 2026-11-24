<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteGroup,
    AutocompleteGroupLabel,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
    AutocompleteSeparator,
  } from "@ui-sdk/svelte/autocomplete"

  const fruitGroups = [
    {
      label: "Tree fruits",
      items: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
    },
    {
      label: "Berries",
      items: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
    },
    { label: "Tropical", items: ["Avocado", "Banana", "Mango", "Pineapple"] },
  ]
</script>

<Autocomplete>
  <div data-slot="stack">
    <AutocompleteLabel>Fruit</AutocompleteLabel>
    <AutocompleteInput placeholder="e.g. Pear" />
  </div>
  <AutocompleteContent>
    <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each fruitGroups as group, index (group.label)}
        {#if index > 0}<AutocompleteSeparator />{/if}
        <AutocompleteGroup>
          <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
          {#each group.items as fruit (fruit)}
            <AutocompleteItem value={fruit}>
              {fruit}
            </AutocompleteItem>
          {/each}
        </AutocompleteGroup>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>

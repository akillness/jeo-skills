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
      fruits: ["Apple", "Apricot", "Cherry", "Lemon", "Peach", "Pear"],
    },
    {
      label: "Berries",
      fruits: ["Blackberry", "Blueberry", "Grape", "Strawberry"],
    },
    { label: "Tropical", fruits: ["Avocado", "Banana", "Mango", "Pineapple"] },
  ]
</script>

<Autocomplete>
  <div data-slot="stack">
    <AutocompleteLabel>Fruit</AutocompleteLabel>
    <AutocompleteInput placeholder="e.g. Peach" />
  </div>
  <AutocompleteContent>
    <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
    <AutocompleteList>
      {#each fruitGroups as group, index (group.label)}
        {#if index > 0}<AutocompleteSeparator />{/if}
        <AutocompleteGroup>
          <AutocompleteGroupLabel>{group.label}</AutocompleteGroupLabel>
          {#each group.fruits as fruit (fruit)}
            <AutocompleteItem value={fruit}>{fruit}</AutocompleteItem>
          {/each}
        </AutocompleteGroup>
      {/each}
    </AutocompleteList>
  </AutocompleteContent>
</Autocomplete>

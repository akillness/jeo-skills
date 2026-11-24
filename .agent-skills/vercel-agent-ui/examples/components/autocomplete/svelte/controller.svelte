<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteEmpty,
    AutocompleteInput,
    AutocompleteItem,
    AutocompleteLabel,
    AutocompleteList,
    createAutocompleteController,
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

  const fruit = createAutocompleteController()
</script>

<div data-slot="stack">
  <div data-slot="controls">
    <button type="button" data-size="sm" onclick={() => fruit.open()}>
      Open
    </button>
    <button type="button" data-size="sm" onclick={() => fruit.setValue("Pea")}>
      Type “Pea”
    </button>
    <button type="button" data-size="sm" onclick={() => fruit.clear()}>
      Clear
    </button>
    <button type="button" data-size="sm" onclick={() => fruit.focus()}>
      Focus
    </button>
  </div>
  <Autocomplete controller={fruit}>
    <AutocompleteLabel>Fruit</AutocompleteLabel>
    <AutocompleteInput />
    <AutocompleteContent>
      <AutocompleteEmpty>No fruits found.</AutocompleteEmpty>
      <AutocompleteList>
        {#each fruits as item (item)}
          <AutocompleteItem value={item}>
            {item}
          </AutocompleteItem>
        {/each}
      </AutocompleteList>
    </AutocompleteContent>
  </Autocomplete>
</div>

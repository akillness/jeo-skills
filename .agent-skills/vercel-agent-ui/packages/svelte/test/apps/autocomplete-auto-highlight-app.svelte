<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteList,
  } from "../../src/autocomplete"

  let { autoHighlight }: { autoHighlight: boolean } = $props()
</script>

<Autocomplete
  items={["Apple", "Banana", "Blueberry"]}
  defaultOpen
  {autoHighlight}
>
  <AutocompleteInput aria-label="Fruit" />
  <AutocompleteContent>
    <AutocompleteList />
  </AutocompleteContent>
</Autocomplete>

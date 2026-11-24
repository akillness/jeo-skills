<script lang="ts">
  import {
    Autocomplete,
    AutocompleteContent,
    AutocompleteInput,
    AutocompleteList,
  } from "../../src/autocomplete"

  // Suggestions as data, open from the start, which the test replaces.
  let {
    items,
    onHighlight,
  }: { items: string[]; onHighlight: (value: string | null) => void } = $props()
</script>

<Autocomplete {items} defaultOpen {onHighlight}>
  <AutocompleteInput aria-label="Fruit" />
  <AutocompleteContent>
    <AutocompleteList />
  </AutocompleteContent>
</Autocomplete>

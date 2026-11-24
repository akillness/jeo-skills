<script lang="ts">
  import {
    Combobox,
    ComboboxContent,
    ComboboxInput,
    ComboboxItem,
    ComboboxItemText,
  } from "../../src/combobox"

  let { items }: { items: string[] } = $props()
</script>

<Combobox defaultOpen filter="contains">
  <ComboboxInput aria-label="Fruit" />
  <ComboboxContent>
    {#each items as item}
      <ComboboxItem value={item}
        ><ComboboxItemText>{item}</ComboboxItemText></ComboboxItem
      >
    {/each}
  </ComboboxContent>
</Combobox>

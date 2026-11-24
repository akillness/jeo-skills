<script lang="ts">
  import { Listbox, ListboxItem, ListboxItemIndicator } from "./listbox-parts"

  let { stray = false }: { stray?: boolean } = $props()
  const fruits = [
    { id: "apple", name: "Apple" },
    { id: "pear", name: "Pear" },
  ]
</script>

<Listbox itemToValue={(fruit: { id: string }) => fruit.id} aria-label="Fruit">
  {#each fruits as fruit (fruit.id)}
    <ListboxItem value={fruit}
      >{fruit.name}<ListboxItemIndicator>✓</ListboxItemIndicator></ListboxItem
    >
  {/each}
  {#if stray}<ListboxItemIndicator>✓</ListboxItemIndicator>{/if}
</Listbox>

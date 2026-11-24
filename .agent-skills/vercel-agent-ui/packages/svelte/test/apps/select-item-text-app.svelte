<script lang="ts">
  import {
    Select,
    SelectContent,
    SelectItem,
    SelectItemText,
    SelectTrigger,
    SelectValue,
  } from "../../src/select"

  let { items }: { items: string[] } = $props()
  let value = $state<string | null>("banana")
</script>

<Select bind:value defaultOpen>
  <SelectTrigger><SelectValue /></SelectTrigger>
  <SelectContent>
    {#each items as item}
      <SelectItem value={item}
        ><SelectItemText>{item.toUpperCase()}</SelectItemText></SelectItem
      >
    {/each}
  </SelectContent>
</Select>

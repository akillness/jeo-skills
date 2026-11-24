<script lang="ts">
  import { Combobox, ComboboxInput } from "../../src/combobox"
  import { Listbox } from "../../src/listbox"
  import { Select, SelectTrigger } from "../../src/select"
  import { Tree } from "../../src/tree"

  // One data component given the test's `$state` items.
  let {
    component,
    items,
    onValueChange,
  }: {
    component: "Listbox" | "Select" | "Combobox" | "Tree"
    items: any[]
    onValueChange?: (value: unknown) => void
  } = $props()
</script>

{#if component === "Listbox"}
  <Listbox aria-label="Letters" {items} {onValueChange} />
{:else if component === "Select"}
  <Select {items} value="a"><SelectTrigger /></Select>
{:else if component === "Combobox"}
  <Combobox {items} defaultOpen><ComboboxInput aria-label="Letter" /></Combobox>
{:else}
  <Tree aria-label="Letters" {items} defaultExpanded={["a"]} />
{/if}

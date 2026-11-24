<script lang="ts">
  import { Combobox, ComboboxInput } from "../../src/combobox"

  let { items }: { items: { value: string; label: string }[] } = $props()
  let value = $state<string | null>("banana")
</script>

<Combobox bind:value {items}>
  <ComboboxInput aria-label="Fruit" />
</Combobox>

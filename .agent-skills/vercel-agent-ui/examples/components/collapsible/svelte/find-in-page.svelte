<script lang="ts">
  import { ChevronDownIcon } from "@lucide/svelte"
  import {
    Collapsible,
    CollapsiblePanel,
    CollapsibleTrigger,
  } from "@ui-sdk/svelte/collapsible"
</script>

<Collapsible data-variant="card">
  <CollapsibleTrigger>
    <span data-slot="stack">
      <span>Ingredients</span>
      <span data-slot="hint">Morning buns, makes 12</span>
    </span>
    <ChevronDownIcon />
  </CollapsibleTrigger>
  <CollapsiblePanel hiddenUntilFound>
    <p>Flour, butter, brown sugar, eggs, a pinch of cardamom and sea salt.</p>
  </CollapsiblePanel>
</Collapsible>

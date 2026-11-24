<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/vue/collapsible"
</script>

<template>
  <Collapsible data-variant="card">
    <CollapsibleTrigger>
      <span data-slot="stack">
        <span>Ingredients</span>
        <span data-slot="hint">Morning buns, makes 12</span>
      </span>
      <ChevronDownIcon />
    </CollapsibleTrigger>
    <CollapsiblePanel hidden-until-found>
      <p>Flour, butter, brown sugar, eggs, a pinch of cardamom and sea salt.</p>
    </CollapsiblePanel>
  </Collapsible>
</template>

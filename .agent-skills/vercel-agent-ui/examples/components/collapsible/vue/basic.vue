<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/vue/collapsible"

const items = [
  { name: "Linen shirt", price: "$48.00" },
  { name: "Canvas tote", price: "$18.00" },
  { name: "Wool socks", price: "$18.00" },
]
</script>

<template>
  <Collapsible data-variant="card">
    <CollapsibleTrigger>
      <span data-slot="stack">
        <span>Order #4189</span>
        <span data-slot="hint">3 items, $84.00</span>
      </span>
      <ChevronDownIcon />
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <div v-for="item in items" :key="item.name" data-slot="row">
        <span>{{ item.name }}</span>
        <span>{{ item.price }}</span>
      </div>
    </CollapsiblePanel>
  </Collapsible>
</template>

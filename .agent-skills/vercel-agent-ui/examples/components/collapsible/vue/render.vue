<script setup lang="ts">
import { ChevronDownIcon } from "@lucide/vue"
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@ui-sdk/vue/collapsible"

const updates = [
  { label: "Out for delivery", time: "07:40" },
  { label: "Arrived at the local depot", time: "05:12" },
  { label: "Left the sorting center", time: "Wed 21:03" },
]
</script>

<template>
  <Collapsible data-variant="card">
    <CollapsibleTrigger>
      <template #render="{ props, children }">
        <h3>
          <button v-bind="props"><component :is="children" /></button>
        </h3>
      </template>
      <template #default="{ state }">
        <span data-slot="stack">
          <span>Track parcel</span>
          <span data-slot="hint">{{
            state.open ? "3 updates" : "Arrives Thursday"
          }}</span>
        </span>
        <ChevronDownIcon />
      </template>
    </CollapsibleTrigger>
    <CollapsiblePanel>
      <template #render="{ props }">
        <ol v-bind="props">
          <li v-for="update in updates" :key="update.label" data-slot="row">
            <span>{{ update.label }}</span>
            <span>{{ update.time }}</span>
          </li>
        </ol>
      </template>
    </CollapsiblePanel>
  </Collapsible>
</template>

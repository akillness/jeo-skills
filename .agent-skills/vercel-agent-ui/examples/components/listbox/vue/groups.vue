<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Listbox,
  ListboxGroup,
  ListboxGroupLabel,
  ListboxItem,
  ListboxItemIndicator,
  ListboxSeparator,
} from "@ui-sdk/vue/listbox"

const produce = [
  {
    label: "Fruits",
    items: [
      { value: "apple", label: "Apple" },
      { value: "banana", label: "Banana" },
      { value: "orange", label: "Orange" },
    ],
  },
  {
    label: "Vegetables",
    items: [
      { value: "carrot", label: "Carrot" },
      { value: "broccoli", label: "Broccoli" },
      { value: "spinach", label: "Spinach" },
    ],
  },
]
</script>

<template>
  <Listbox multiple :default-value="['banana']" aria-label="Produce">
    <template v-for="(group, index) in produce" :key="group.label">
      <ListboxSeparator v-if="index > 0" />
      <ListboxGroup>
        <ListboxGroupLabel>{{ group.label }}</ListboxGroupLabel>
        <ListboxItem
          v-for="item in group.items"
          :key="item.value"
          :value="item.value"
        >
          {{ item.label }}
          <ListboxItemIndicator>
            <CheckIcon aria-hidden="true" />
          </ListboxItemIndicator>
        </ListboxItem>
      </ListboxGroup>
    </template>
  </Listbox>
</template>

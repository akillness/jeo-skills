<script setup lang="ts">
import { Listbox, ListboxItem } from "@ui-sdk/vue/listbox"

const sizes = [
  { value: "xs", label: "XS" },
  { value: "s", label: "S" },
  { value: "m", label: "M" },
  { value: "l", label: "L" },
  { value: "xl", label: "XL", disabled: true },
]
</script>

<template>
  <Listbox
    orientation="horizontal"
    :loop="false"
    default-value="m"
    aria-label="Size"
  >
    <ListboxItem
      v-for="size in sizes"
      :key="size.value"
      :value="size.value"
      :disabled="size.disabled"
    >
      {{ size.label }}
    </ListboxItem>
  </Listbox>
</template>

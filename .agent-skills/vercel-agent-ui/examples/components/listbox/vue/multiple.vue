<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIndicator } from "@ui-sdk/vue/listbox"
import { useLog } from "../../../shared/vue/log"

const toppings = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Extra cheese" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "onion", label: "Onion" },
  { value: "pepper", label: "Pepper" },
]

const log = useLog()
</script>

<template>
  <Listbox
    multiple
    :default-value="['cheese', 'onion']"
    aria-label="Toppings"
    @value-change="
      (value, details) =>
        log(`${value.join(', ') || 'Nothing'} (${details.reason})`)
    "
  >
    <ListboxItem
      v-for="topping in toppings"
      :key="topping.value"
      :value="topping.value"
    >
      {{ topping.label }}
      <ListboxItemIndicator>
        <CheckIcon aria-hidden="true" />
      </ListboxItemIndicator>
    </ListboxItem>
  </Listbox>
</template>

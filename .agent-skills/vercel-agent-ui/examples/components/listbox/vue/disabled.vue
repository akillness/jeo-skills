<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Listbox, ListboxItem, ListboxItemIndicator } from "@ui-sdk/vue/listbox"
import { ref } from "vue"

const toppings = [
  { value: "basil", label: "Basil" },
  { value: "cheese", label: "Extra cheese" },
  { value: "mushroom", label: "Mushroom" },
  { value: "olive", label: "Olive" },
  { value: "onion", label: "Onion" },
  { value: "pepper", label: "Pepper" },
]

const disabled = ref(false)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="disabled = !disabled">
        {{ disabled ? "Enable the List" : "Disable the List" }}
      </button>
    </div>
    <Listbox
      multiple
      :disabled="disabled"
      :default-value="['basil']"
      aria-label="Toppings"
    >
      <ListboxItem
        v-for="topping in toppings"
        :key="topping.value"
        :value="topping.value"
        :disabled="topping.value === 'olive'"
      >
        {{ topping.label }}
        <ListboxItemIndicator>
          <CheckIcon aria-hidden="true" />
        </ListboxItemIndicator>
      </ListboxItem>
    </Listbox>
  </div>
</template>

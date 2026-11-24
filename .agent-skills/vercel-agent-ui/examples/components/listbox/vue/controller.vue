<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  createListboxController,
  Listbox,
  ListboxItem,
  ListboxItemIndicator,
} from "@ui-sdk/vue/listbox"
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
const controller = createListboxController<string, true>()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="controller.selectAll()">Select All</button>
      <button type="button" @click="controller.clear()">Clear</button>
      <button type="button" @click="controller.focus()">Focus</button>
    </div>
    <Listbox
      multiple
      :controller="controller"
      aria-label="Toppings"
      @value-change="
        (value, details) => log(`${value.length} selected (${details.reason})`)
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
  </div>
</template>

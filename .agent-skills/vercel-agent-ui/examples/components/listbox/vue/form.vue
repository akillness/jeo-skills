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

function onSubmit(event: Event) {
  log(
    `Ordered ${new FormData(event.currentTarget as HTMLFormElement).getAll("toppings").join(", ")}`
  )
}
</script>

<template>
  <div data-slot="stack">
    <Listbox
      multiple
      name="toppings"
      form="pizza-order"
      required
      :default-value="['cheese']"
      aria-label="Toppings"
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
    <form id="pizza-order" data-slot="row" @submit.prevent="onSubmit">
      <button type="reset">Reset</button>
      <button data-variant="solid">Order</button>
    </form>
  </div>
</template>

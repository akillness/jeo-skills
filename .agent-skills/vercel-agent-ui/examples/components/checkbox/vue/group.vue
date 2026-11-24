<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/vue/checkbox"

const toppings = [
  { value: "cheese", label: "Cheese" },
  { value: "mushrooms", label: "Mushrooms" },
  { value: "olives", label: "Olives" },
  { value: "peppers", label: "Peppers" },
]
</script>

<template>
  <div data-slot="stack">
    <h3 id="basic-toppings">Toppings</h3>
    <CheckboxGroup aria-labelledby="basic-toppings" :default-value="['cheese']">
      <label data-slot="label" v-for="topping in toppings" :key="topping.value">
        <Checkbox :value="topping.value">
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        {{ topping.label }}
      </label>
    </CheckboxGroup>
  </div>
</template>

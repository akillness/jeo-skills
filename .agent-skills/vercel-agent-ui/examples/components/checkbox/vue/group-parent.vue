<script setup lang="ts">
import { CheckIcon, MinusIcon } from "@lucide/vue"
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
    <h3 id="parent-toppings">Toppings</h3>
    <CheckboxGroup
      aria-labelledby="parent-toppings"
      :default-value="['cheese', 'olives']"
      :all-values="toppings.map((topping) => topping.value)"
    >
      <label data-slot="label">
        <Checkbox parent>
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
            <MinusIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        Select all
      </label>
      <div data-slot="stack">
        <label
          data-slot="label"
          v-for="topping in toppings"
          :key="topping.value"
        >
          <Checkbox :value="topping.value">
            <CheckboxIndicator>
              <CheckIcon aria-hidden="true" />
            </CheckboxIndicator>
          </Checkbox>
          {{ topping.label }}
        </label>
      </div>
    </CheckboxGroup>
  </div>
</template>

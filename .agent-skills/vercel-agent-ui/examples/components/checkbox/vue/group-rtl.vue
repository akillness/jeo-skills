<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/vue/checkbox"

const toppings = [
  { value: "cheese", label: "جبن" },
  { value: "mushrooms", label: "فطر" },
  { value: "olives", label: "زيتون" },
  { value: "peppers", label: "فلفل" },
]
</script>

<template>
  <div data-slot="stack" dir="rtl">
    <h3 id="rtl-toppings">الإضافات</h3>
    <CheckboxGroup aria-labelledby="rtl-toppings" :default-value="['cheese']">
      <label data-slot="label" v-for="topping in toppings" :key="topping.value">
        <Checkbox :value="topping.value">
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        {{ topping.label }}
      </label>
    </CheckboxGroup>
  </div>
</template>

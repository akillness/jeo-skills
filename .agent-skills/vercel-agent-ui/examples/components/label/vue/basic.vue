<script setup lang="ts">
import { Label } from "@ui-sdk/vue/label"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"

const speeds = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]
</script>

<template>
  <div data-slot="stack">
    <Label for="shipping-speed">Shipping speed</Label>
    <RadioGroup id="shipping-speed" default-value="standard">
      <Label v-for="speed in speeds" :key="speed.value">
        <Radio :value="speed.value">
          <RadioIndicator />
        </Radio>
        {{ speed.label }}
      </Label>
    </RadioGroup>
  </div>
</template>

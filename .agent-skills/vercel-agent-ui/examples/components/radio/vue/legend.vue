<script setup lang="ts">
import { FieldDescription, FieldLegend, FieldSet } from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"
import { useId } from "vue"

const periods = [
  { value: "monthly", label: "Monthly", price: "$12 per month" },
  { value: "yearly", label: "Yearly", price: "$120 per year" },
]

const id = useId()
</script>

<template>
  <FieldSet>
    <FieldLegend :id="`${id}-legend`">Billing period</FieldLegend>
    <FieldDescription :id="`${id}-description`"
      >Yearly billing gets you two months free.</FieldDescription
    >
    <RadioGroup
      default-value="monthly"
      :aria-labelledby="`${id}-legend`"
      :aria-describedby="`${id}-description`"
    >
      <label v-for="period in periods" :key="period.value" data-slot="label">
        <Radio :value="period.value">
          <RadioIndicator />
        </Radio>
        {{ period.label }}
        <span data-slot="hint">({{ period.price }})</span>
      </label>
    </RadioGroup>
  </FieldSet>
</template>

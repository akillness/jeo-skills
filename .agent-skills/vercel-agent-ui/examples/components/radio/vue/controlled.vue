<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  createRadioGroupController,
  Radio,
  RadioGroup,
  RadioIndicator,
} from "@ui-sdk/vue/radio"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const plans = [
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

const log = useLog()
const planGroup = createRadioGroupController()
const value = ref<string | null>("pro")

function onValueChange(next: string | null, details: { reason: string }) {
  log(
    `${plans.find((plan) => plan.value === next)?.label ?? "None"} (${details.reason})`
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="planGroup.setValue('team')">
        Choose Team
      </button>
    </div>
    <Field>
      <FieldLabel>Plan</FieldLabel>
      <RadioGroup
        v-model:value="value"
        :controller="planGroup"
        @value-change="onValueChange"
      >
        <label v-for="plan in plans" :key="plan.value" data-slot="label">
          <Radio :value="plan.value">
            <RadioIndicator />
          </Radio>
          {{ plan.label }}
        </label>
      </RadioGroup>
    </Field>
  </div>
</template>

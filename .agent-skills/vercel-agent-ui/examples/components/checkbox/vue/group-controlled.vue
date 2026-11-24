<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import type { ChangeDetails } from "@ui-sdk/core"
import { createCheckboxGroupController } from "@ui-sdk/core/checkbox"
import {
  Checkbox,
  CheckboxGroup,
  CheckboxIndicator,
} from "@ui-sdk/vue/checkbox"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const days = [
  { value: "mon", label: "Monday" },
  { value: "tue", label: "Tuesday" },
  { value: "wed", label: "Wednesday" },
  { value: "thu", label: "Thursday" },
  { value: "fri", label: "Friday" },
  { value: "sat", label: "Saturday" },
  { value: "sun", label: "Sunday" },
]

const weekdays = ["mon", "tue", "wed", "thu", "fri"]

const log = useLog()
const schedule = createCheckboxGroupController()
const value = ref(["mon", "tue"])

function onValueChange(next: string[], details: ChangeDetails) {
  const names = days
    .filter((day) => next.includes(day.value))
    .map((day) => day.label)
  log(`${names.join(", ") || "No days"} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="schedule.setValue(weekdays)">
        Select Weekdays
      </button>
      <button type="button" @click="schedule.setValue([])">Clear</button>
    </div>
    <h3 id="controlled-days">Working days</h3>
    <CheckboxGroup
      v-model:value="value"
      aria-labelledby="controlled-days"
      :controller="schedule"
      @value-change="onValueChange"
    >
      <label data-slot="label" v-for="day in days" :key="day.value">
        <Checkbox :value="day.value">
          <CheckboxIndicator>
            <CheckIcon aria-hidden="true" />
          </CheckboxIndicator>
        </Checkbox>
        {{ day.label }}
      </label>
    </CheckboxGroup>
  </div>
</template>

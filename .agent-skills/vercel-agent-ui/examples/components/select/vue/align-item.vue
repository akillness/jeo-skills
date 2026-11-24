<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { ref } from "vue"

const priorities = [
  { value: "urgent", label: "Urgent" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
  { value: "none", label: "No priority" },
]

const aligned = ref(true)
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <label data-slot="label">
        <Checkbox
          :checked="aligned"
          @checked-change="(next) => (aligned = next === true)"
        >
          <CheckboxIndicator>
            <CheckIcon />
          </CheckboxIndicator>
        </Checkbox>
        Align item with trigger
      </label>
    </div>
    <Field>
      <FieldLabel>Priority</FieldLabel>
      <Select default-value="medium">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent :align-item-with-trigger="aligned">
          <SelectItem
            v-for="priority in priorities"
            :key="priority.value"
            :value="priority.value"
          >
            {{ priority.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </div>
</template>

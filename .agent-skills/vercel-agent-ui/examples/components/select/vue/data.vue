<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectGroupLabel,
  SelectItem,
  SelectItemIndicator,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
  type ListData,
} from "@ui-sdk/vue/select"

const plans = [
  { value: "free", label: "Free" },
  { value: "pro", label: "Pro" },
  { value: "team", label: "Team" },
]

const sales = [
  { value: "enterprise", label: "Enterprise" },
  { value: "education", label: "Education", disabled: true },
]

const items: ListData = [
  ...plans,
  { type: "separator" },
  { type: "group", label: "Contact sales", items: sales },
]
</script>

<template>
  <Field>
    <FieldLabel>Plan</FieldLabel>
    <Select :items="items" default-value="pro">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="plan in plans" :key="plan.value" :value="plan.value">
          {{ plan.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
        <SelectSeparator />
        <SelectGroup>
          <SelectGroupLabel>Contact sales</SelectGroupLabel>
          <SelectItem
            v-for="plan in sales"
            :key="plan.value"
            :value="plan.value"
            :disabled="plan.disabled"
          >
            {{ plan.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
</template>

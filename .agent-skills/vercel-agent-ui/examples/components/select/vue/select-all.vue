<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, MinusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectSelectAll,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"

const regions = [
  { value: "us-east", label: "US East" },
  { value: "us-west", label: "US West" },
  { value: "europe", label: "Europe" },
  { value: "asia-pacific", label: "Asia Pacific" },
  { value: "south-america", label: "South America" },
]
</script>

<template>
  <Field>
    <FieldLabel>Regions</FieldLabel>
    <Select
      multiple
      :default-value="['us-east', 'europe', 'asia-pacific']"
      placeholder="Select regions"
    >
      <SelectTrigger>
        <SelectValue
          :max-labels="2"
          :get-more-label="(count: number) => `${count} more`"
        />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectSelectAll v-slot="{ state }">
          Select all
          <CheckIcon v-if="state.checked" />
          <MinusIcon v-if="state.indeterminate" />
        </SelectSelectAll>
        <SelectSeparator />
        <SelectItem
          v-for="region in regions"
          :key="region.value"
          :value="region.value"
        >
          {{ region.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

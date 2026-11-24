<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"

const countries = [
  { value: "ca", label: "Canada" },
  { value: "dk", label: "Denmark" },
  { value: "fr", label: "France" },
  { value: "de", label: "Germany" },
  { value: "jp", label: "Japan" },
  { value: "es", label: "Spain" },
]

const fields = [
  { label: "Billing country", disabled: true },
  { label: "Shipping from", readOnly: true },
  { label: "Shipping to" },
]
</script>

<template>
  <div data-slot="stack">
    <Field v-for="field in fields" :key="field.label">
      <FieldLabel>{{ field.label }}</FieldLabel>
      <Select
        :default-value="field.disabled || field.readOnly ? 'fr' : null"
        placeholder="Select a country"
        :disabled="field.disabled"
        :read-only="field.readOnly"
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="country in countries"
            :key="country.value"
            :value="country.value"
            :disabled="country.value === 'dk'"
          >
            {{ country.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </div>
</template>

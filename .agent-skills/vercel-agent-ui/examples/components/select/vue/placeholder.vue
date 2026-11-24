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

const sizes = ["Extra small", "Small", "Medium", "Large", "Extra large"]

const wraps = ["Paper", "Ribbon", "Box"]
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Size</FieldLabel>
      <Select placeholder="Select a size">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="size in sizes" :key="size" :value="size">
            {{ size }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <Field>
      <FieldLabel>Gift wrap</FieldLabel>
      <Select>
        <SelectTrigger>
          <SelectValue placeholder="None" />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem v-for="wrap in wraps" :key="wrap" :value="wrap">
            {{ wrap }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </div>
</template>

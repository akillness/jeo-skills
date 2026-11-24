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
  SelectTrigger,
  SelectValue,
  type ListData,
} from "@ui-sdk/vue/select"

const sizeGroups = [
  { type: "group", label: "Common", items: ["Small", "Medium", "Large"] },
  { type: "group", label: "Extended", items: ["Extra small", "Extra large"] },
] satisfies ListData
</script>

<template>
  <Field>
    <FieldLabel>Size</FieldLabel>
    <Select :items="sizeGroups" name="size" default-value="Medium">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup v-for="group in sizeGroups" :key="group.label">
          <SelectGroupLabel>{{ group.label }}</SelectGroupLabel>
          <SelectItem v-for="size in group.items" :key="size" :value="size">
            {{ size }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
</template>

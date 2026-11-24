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
} from "@ui-sdk/vue/select"

const timezones = [
  {
    label: "North America",
    items: [
      { value: "est", label: "Eastern Standard Time" },
      { value: "cst", label: "Central Standard Time" },
      { value: "mst", label: "Mountain Standard Time" },
      { value: "pst", label: "Pacific Standard Time" },
      { value: "akst", label: "Alaska Standard Time" },
      { value: "hst", label: "Hawaii Standard Time" },
    ],
  },
  {
    label: "Europe & Africa",
    items: [
      { value: "gmt", label: "Greenwich Mean Time" },
      { value: "cet", label: "Central European Time" },
      { value: "eet", label: "Eastern European Time" },
      { value: "west", label: "Western European Summer Time" },
      { value: "cat", label: "Central Africa Time" },
      { value: "eat", label: "East Africa Time" },
    ],
  },
  {
    label: "Asia",
    items: [
      { value: "msk", label: "Moscow Time" },
      { value: "ist", label: "India Standard Time" },
      { value: "cst-china", label: "China Standard Time" },
      { value: "jst", label: "Japan Standard Time" },
      { value: "kst", label: "Korea Standard Time" },
      { value: "ist-indonesia", label: "Indonesia Central Standard Time" },
    ],
  },
  {
    label: "Australia & Pacific",
    items: [
      { value: "awst", label: "Australian Western Standard Time" },
      { value: "acst", label: "Australian Central Standard Time" },
      { value: "aest", label: "Australian Eastern Standard Time" },
      { value: "nzst", label: "New Zealand Standard Time" },
      { value: "fjt", label: "Fiji Time" },
    ],
  },
]
</script>

<template>
  <Field>
    <FieldLabel>Time zone</FieldLabel>
    <Select placeholder="Select a time zone">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup v-for="group in timezones" :key="group.label">
          <SelectGroupLabel>{{ group.label }}</SelectGroupLabel>
          <SelectItem
            v-for="item in group.items"
            :key="item.value"
            :value="item.value"
          >
            {{ item.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </Field>
</template>

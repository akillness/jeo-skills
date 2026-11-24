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
} from "@ui-sdk/vue/select"

const fonts = [
  {
    label: "Sans serif",
    items: [
      { value: "inter", label: "Inter" },
      { value: "geist", label: "Geist" },
    ],
  },
  {
    label: "Serif",
    items: [
      { value: "source-serif", label: "Source Serif" },
      { value: "lora", label: "Lora" },
    ],
  },
  {
    label: "Monospace",
    items: [
      { value: "geist-mono", label: "Geist Mono" },
      { value: "jetbrains-mono", label: "JetBrains Mono" },
    ],
  },
]
</script>

<template>
  <Field>
    <FieldLabel>Font</FieldLabel>
    <Select placeholder="Select a font">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <template v-for="(group, index) in fonts" :key="group.label">
          <SelectSeparator v-if="index > 0" />
          <SelectGroup>
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
        </template>
      </SelectContent>
    </Select>
  </Field>
</template>

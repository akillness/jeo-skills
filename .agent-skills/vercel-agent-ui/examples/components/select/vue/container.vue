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
import { ref } from "vue"

const fonts = [
  { value: "inter", label: "Inter" },
  { value: "geist", label: "Geist" },
  { value: "source-serif", label: "Source Serif" },
  { value: "geist-mono", label: "Geist Mono" },
]

const container = ref<HTMLDivElement | null>(null)
</script>

<template>
  <div data-slot="stack">
    <Field>
      <FieldLabel>Font</FieldLabel>
      <Select :container="container" default-value="inter">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="font in fonts"
            :key="font.value"
            :value="font.value"
          >
            {{ font.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <div ref="container" data-slot="card" />
  </div>
</template>

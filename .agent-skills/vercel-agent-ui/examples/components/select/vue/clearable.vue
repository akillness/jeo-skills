<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, XIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectClear,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { useLog } from "../../../shared/vue/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Assignee</FieldLabel>
    <Select
      default-value="ines"
      placeholder="Unassigned"
      @value-change="
        (value, details) =>
          log(`value: ${JSON.stringify(value)} (${details.reason})`)
      "
    >
      <div data-slot="row">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectClear aria-label="Clear assignee">
          <XIcon />
        </SelectClear>
      </div>
      <SelectContent>
        <SelectItem
          v-for="person in people"
          :key="person.value"
          :value="person.value"
        >
          {{ person.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

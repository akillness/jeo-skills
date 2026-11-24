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

const members = [
  { value: "hollis", name: "Hollis Grant", email: "hollis@example.com" },
  { value: "ines", name: "Inès Moreau", email: "ines@example.com" },
  { value: "kofi", name: "Kofi Mensah", email: "kofi@example.com" },
  { value: "wren", name: "Wren Takahashi", email: "wren@example.com" },
]
</script>

<template>
  <Field>
    <FieldLabel>Reviewer</FieldLabel>
    <Select default-value="hollis">
      <SelectTrigger>
        <template #render="{ props, children }">
          <button v-bind="props">
            <component :is="children" />
            <ChevronDownIcon />
          </button>
        </template>
        <SelectValue v-slot="{ state }">
          <span data-slot="badge">{{ state.label.slice(0, 1) }}</span>
          {{ state.label }}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="member in members"
          :key="member.value"
          v-slot="{ state }"
          :value="member.value"
          :label="member.name"
          :disabled="member.value === 'wren'"
        >
          <span data-slot="badge">{{ member.name.slice(0, 1) }}</span>
          <span data-slot="stack">
            {{ member.name }}
            <span data-slot="hint">{{
              state.disabled ? "Out of office" : member.email
            }}</span>
          </span>
          <SelectItemIndicator>
            <template #render="{ props, state: indicator }">
              <span v-bind="props"
                ><CheckIcon v-if="indicator.selected"
              /></span>
            </template>
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

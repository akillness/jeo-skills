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
import { useLog } from "../../../shared/vue/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const modes = [
  { value: "pointer", label: "Pointer" },
  { value: true, label: "Modal" },
  { value: false, label: "Non-modal" },
] as const

const modal = ref<boolean | "pointer">("pointer")
const log = useLog()
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls" role="group" aria-label="Modal">
      <button
        v-for="mode in modes"
        :key="mode.label"
        type="button"
        :aria-pressed="modal === mode.value"
        @click="modal = mode.value"
      >
        {{ mode.label }}
      </button>
    </div>
    <Field>
      <FieldLabel>Status</FieldLabel>
      <Select :modal="modal" default-value="todo">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="status in statuses"
            :key="status.value"
            :value="status.value"
          >
            {{ status.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
    <button type="button" @click="log('Pressed Save Draft')">Save Draft</button>
  </div>
</template>

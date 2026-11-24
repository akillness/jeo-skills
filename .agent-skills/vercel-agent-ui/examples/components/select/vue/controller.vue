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
  createSelectController,
} from "@ui-sdk/vue/select"
import { useLog } from "../../../shared/vue/log"

const statuses = [
  { value: "backlog", label: "Backlog" },
  { value: "todo", label: "Todo" },
  { value: "in-progress", label: "In Progress" },
  { value: "done", label: "Done" },
]

const status = createSelectController<string>()
const log = useLog()

async function openAndWait() {
  const { reason } = await status.open()
  log(`Closed by ${reason}, with ${status.getValue() ?? "nothing"}`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="openAndWait">Open and Wait</button>
      <button type="button" @click="status.setValue('done')">Mark Done</button>
      <button type="button" @click="status.clear()">Clear</button>
      <button type="button" @click="status.focus()">Focus</button>
    </div>
    <Field>
      <FieldLabel>Status</FieldLabel>
      <SelectTrigger :controller="status">
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
    </Field>
    <Select
      :controller="status"
      :items="statuses"
      placeholder="Select a status"
    >
      <SelectContent>
        <SelectItem
          v-for="item in statuses"
          :key="item.value"
          :value="item.value"
        >
          {{ item.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </div>
</template>

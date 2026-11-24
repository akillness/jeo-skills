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

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
  { value: "owner", label: "Owner" },
]

const value = ref<string | null>("viewer")
const open = ref(false)
const log = useLog()

function changeValue(
  next: string | null,
  details: { reason: string; cancel: () => void }
) {
  if (next === "owner") {
    details.cancel()
    log("Only the owner can transfer ownership")
    return
  }
  log(`value: ${next} (${details.reason})`)
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="value = 'editor'">Make Editor</button>
      <button type="button" @click="open = true">Open</button>
    </div>
    <Field>
      <FieldLabel>Role</FieldLabel>
      <Select
        v-model:value="value"
        v-model:open="open"
        @value-change="changeValue"
        @open-change="
          (next, details) => log(`open: ${next} (${details.reason})`)
        "
      >
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="role in roles"
            :key="role.value"
            :value="role.value"
          >
            {{ role.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  </div>
</template>

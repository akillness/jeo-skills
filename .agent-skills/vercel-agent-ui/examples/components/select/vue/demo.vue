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

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
]
</script>

<template>
  <Field>
    <FieldLabel>Role</FieldLabel>
    <Select placeholder="Select a role">
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="role in roles" :key="role.value" :value="role.value">
          {{ role.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

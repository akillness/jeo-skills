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
import { useLog } from "../../../shared/vue/log"

const roles = [
  { value: "viewer", label: "Viewer" },
  { value: "commenter", label: "Commenter" },
  { value: "editor", label: "Editor" },
  { value: "admin", label: "Admin" },
]

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Role</FieldLabel>
    <Select
      default-value="editor"
      @open-change-complete="
        (open) => log(open ? 'Finished opening' : 'Finished closing')
      "
    >
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="role in roles" :key="role.value" :value="role.value">
          {{ role.label }}
          <SelectItemIndicator keep-mounted>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

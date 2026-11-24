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

type Member = { id: number; name: string; email: string }

const members: Member[] = [
  { id: 1, name: "Hollis Grant", email: "hollis@example.com" },
  { id: 2, name: "Inès Moreau", email: "ines@example.com" },
  { id: 3, name: "Kofi Mensah", email: "kofi@example.com" },
  { id: 4, name: "Wren Takahashi", email: "wren@example.com" },
]

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Assignee</FieldLabel>
    <Select
      :default-value="{ ...members[1] }"
      name="assignee"
      :item-to-value="(member: Member) => String(member.id)"
      :item-to-label="(member: Member) => member.name"
      :is-item-equal-to-value="
        (item: Member, value: Member) => item.id === value.id
      "
      placeholder="Unassigned"
      @value-change="
        (member: Member | null) =>
          log(`Submits assignee=${member ? member.id : ''}`)
      "
    >
      <SelectTrigger>
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem v-for="member in members" :key="member.id" :value="member">
          <span data-slot="stack">
            {{ member.name }}
            <span data-slot="hint">{{ member.email }}</span>
          </span>
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

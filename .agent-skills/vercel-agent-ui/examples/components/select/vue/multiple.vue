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

const languages = [
  { value: "en", label: "English" },
  { value: "fr", label: "French" },
  { value: "de", label: "German" },
  { value: "ja", label: "Japanese" },
  { value: "pt", label: "Portuguese" },
  { value: "es", label: "Spanish" },
]

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Languages</FieldLabel>
    <Select
      multiple
      :default-value="['en', 'ja']"
      placeholder="Select languages"
      @value-change="(value) => log(`value: ${JSON.stringify(value)}`)"
    >
      <SelectTrigger>
        <SelectValue v-slot="{ state }">
          {{
            state.placeholder
              ? "Select languages"
              : state.labels.length > 2
                ? `${state.labels[0]} and ${state.labels.length - 1} more`
                : state.label
          }}
        </SelectValue>
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem
          v-for="language in languages"
          :key="language.value"
          :value="language.value"
        >
          {{ language.label }}
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

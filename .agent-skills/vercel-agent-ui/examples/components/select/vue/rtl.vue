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

const languages = [
  { value: "ar", label: "العربية" },
  { value: "en", label: "الإنجليزية" },
  { value: "fr", label: "الفرنسية" },
  { value: "es", label: "الإسبانية" },
  { value: "de", label: "الألمانية" },
]
</script>

<template>
  <div dir="rtl">
    <Field>
      <FieldLabel>اللغة</FieldLabel>
      <Select placeholder="اختر لغة">
        <SelectTrigger>
          <SelectValue />
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
  </div>
</template>

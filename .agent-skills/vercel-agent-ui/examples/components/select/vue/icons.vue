<script setup lang="ts">
import {
  CheckIcon,
  ChevronDownIcon,
  TextAlignCenterIcon,
  TextAlignEndIcon,
  TextAlignStartIcon,
} from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIcon,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
  SelectValueIcon,
} from "@ui-sdk/vue/select"
</script>

<template>
  <Field>
    <FieldLabel>Text alignment</FieldLabel>
    <Select default-value="start">
      <SelectTrigger>
        <SelectValueIcon />
        <SelectValue />
        <ChevronDownIcon />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="start">
          <SelectItemIcon mirror>
            <TextAlignStartIcon />
          </SelectItemIcon>
          Start
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
        <SelectItem value="center">
          <SelectItemIcon>
            <TextAlignCenterIcon />
          </SelectItemIcon>
          Center
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
        <SelectItem value="end">
          <SelectItemIcon mirror>
            <TextAlignEndIcon />
          </SelectItemIcon>
          End
          <SelectItemIndicator>
            <CheckIcon />
          </SelectItemIndicator>
        </SelectItem>
      </SelectContent>
    </Select>
  </Field>
</template>

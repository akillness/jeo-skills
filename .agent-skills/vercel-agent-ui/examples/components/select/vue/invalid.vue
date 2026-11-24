<script setup lang="ts">
import { CheckIcon, ChevronDownIcon } from "@lucide/vue"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import { useLog } from "../../../shared/vue/log"

const methods = [
  { value: "standard", label: "Standard" },
  { value: "express", label: "Express" },
  { value: "overnight", label: "Overnight" },
]

const log = useLog()

function submit(event: Event) {
  log(
    `Submitted shipping=${new FormData(event.currentTarget as HTMLFormElement).get("shipping")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field name="shipping">
      <FieldLabel>Shipping method</FieldLabel>
      <Select required placeholder="Select a shipping method">
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="method in methods"
            :key="method.value"
            :value="method.value"
          >
            {{ method.label }}
            <SelectItemIndicator>
              <CheckIcon />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
      <FieldDescription>Express arrives in two business days.</FieldDescription>
      <FieldError match="valueMissing">Choose a shipping method.</FieldError>
    </Field>
    <button type="submit" data-variant="solid">Continue</button>
  </form>
</template>

<script setup lang="ts">
import { XIcon } from "@lucide/vue"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { Input, InputClear, InputGroup } from "@ui-sdk/vue/input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Field name="website">
    <FieldLabel>Website</FieldLabel>
    <InputGroup>
      <span>https://</span>
      <Input
        placeholder="example.com"
        default-value="hollisgrant.com"
        @value-change="
          (value: string, details: { reason: string }) =>
            log(`${value ? `“${value}”` : 'Empty'} (${details.reason})`)
        "
      />
      <InputClear aria-label="Clear website">
        <XIcon aria-hidden="true" />
      </InputClear>
    </InputGroup>
    <FieldDescription>Shown on your public profile.</FieldDescription>
  </Field>
</template>

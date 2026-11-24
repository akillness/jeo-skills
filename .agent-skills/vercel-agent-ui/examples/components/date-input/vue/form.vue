<script setup lang="ts">
import { DateInput } from "@ui-sdk/vue/date-input"
import { Field, FieldError, FieldLabel } from "@ui-sdk/vue/field"
import { TimeInput } from "@ui-sdk/vue/time-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: SubmitEvent) {
  const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${data.join(", ")}`)
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <FieldLabel>Date</FieldLabel>
      <DateInput name="date" default-value="2026-11-02" required />
      <FieldError />
    </Field>
    <Field>
      <FieldLabel>Time</FieldLabel>
      <TimeInput name="time" default-value="09:30" required />
      <FieldError />
    </Field>
    <div data-slot="row">
      <button type="reset">Reset</button>
      <button type="submit" data-variant="solid">Book</button>
    </div>
  </form>
</template>

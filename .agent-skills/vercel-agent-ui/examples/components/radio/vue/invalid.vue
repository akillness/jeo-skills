<script setup lang="ts">
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { Radio, RadioGroup, RadioIndicator } from "@ui-sdk/vue/radio"
import { useLog } from "../../../shared/vue/log"

const channels = [
  { value: "email", label: "Email only" },
  { value: "sms", label: "SMS only" },
  { value: "both", label: "Email and SMS" },
]

const log = useLog()

function submit(event: Event) {
  log(
    `Saved updates=${new FormData(event.currentTarget as HTMLFormElement).get("updates")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field>
      <FieldLabel>Order updates</FieldLabel>
      <FieldDescription
        >Choose how we tell you about your orders.</FieldDescription
      >
      <RadioGroup name="updates" required>
        <label
          v-for="channel in channels"
          :key="channel.value"
          data-slot="label"
        >
          <Radio :value="channel.value">
            <RadioIndicator />
          </Radio>
          {{ channel.label }}
        </label>
      </RadioGroup>
      <FieldError>Choose how to get order updates.</FieldError>
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Save</button>
    </div>
  </form>
</template>

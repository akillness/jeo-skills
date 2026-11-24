<script setup lang="ts">
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  const data = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(`Submitted ${data.join(", ")}`)
}
</script>

<template>
  <div data-slot="stack">
    <form id="verify-sign-in" @submit.prevent="onSubmit">
      <Field>
        <FieldLabel>Verification code</FieldLabel>
        <OTPInput name="code" required>
          <OTPInputGroup>
            <OTPInputSlot
              v-for="index in [0, 1, 2, 3, 4, 5]"
              :key="index"
              :index="index"
            />
          </OTPInputGroup>
        </OTPInput>
        <FieldDescription
          >Enter the six-digit code we sent to
          hollis@example.com.</FieldDescription
        >
        <FieldError />
      </Field>
    </form>
    <Field>
      <FieldLabel>Recovery code (optional)</FieldLabel>
      <OTPInput
        name="recovery"
        form="verify-sign-in"
        :max-length="8"
        pattern="alphanumeric"
      >
        <OTPInputGroup>
          <OTPInputSlot
            v-for="index in [0, 1, 2, 3, 4, 5, 6, 7]"
            :key="index"
            :index="index"
          />
        </OTPInputGroup>
      </OTPInput>
      <FieldError />
    </Field>
    <div data-slot="row">
      <button type="reset" form="verify-sign-in">Reset</button>
      <button type="submit" form="verify-sign-in" data-variant="solid">
        Verify
      </button>
    </div>
  </div>
</template>

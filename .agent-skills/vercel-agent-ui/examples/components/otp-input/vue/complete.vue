<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Verification code</FieldLabel>
    <OTPInput
      @value-commit="
        (value, details) => log(`Checking ${value} (${details.reason})`)
      "
    >
      <OTPInputGroup>
        <OTPInputSlot
          v-for="index in [0, 1, 2, 3, 4, 5]"
          :key="index"
          :index="index"
        />
      </OTPInputGroup>
    </OTPInput>
  </Field>
</template>

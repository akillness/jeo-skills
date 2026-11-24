<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
</script>

<template>
  <Field>
    <FieldLabel>PIN</FieldLabel>
    <OTPInput :max-length="4" text-align="center">
      <OTPInputGroup>
        <OTPInputSlot
          v-for="index in [0, 1, 2, 3]"
          :key="index"
          :index="index"
        />
      </OTPInputGroup>
    </OTPInput>
  </Field>
</template>

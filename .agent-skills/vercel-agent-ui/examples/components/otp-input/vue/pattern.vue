<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
</script>

<template>
  <Field>
    <FieldLabel>Device code</FieldLabel>
    <OTPInput :max-length="6" :pattern="/[0-9A-F]/i" input-mode="text">
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

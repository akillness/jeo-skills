<script setup lang="ts">
import { MinusIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  OTPInput,
  OTPInputGroup,
  OTPInputSeparator,
  OTPInputSlot,
} from "@ui-sdk/vue/otp-input"
</script>

<template>
  <Field>
    <FieldLabel>Recovery code</FieldLabel>
    <OTPInput :max-length="8" pattern="alphanumeric">
      <OTPInputGroup>
        <OTPInputSlot
          v-for="index in [0, 1, 2, 3]"
          :key="index"
          :index="index"
        />
      </OTPInputGroup>
      <OTPInputSeparator>
        <MinusIcon aria-hidden="true" />
      </OTPInputSeparator>
      <OTPInputGroup>
        <OTPInputSlot
          v-for="index in [4, 5, 6, 7]"
          :key="index"
          :index="index"
        />
      </OTPInputGroup>
    </OTPInput>
  </Field>
</template>

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
    <FieldLabel>Verification code</FieldLabel>
    <OTPInput :max-length="6">
      <OTPInputGroup>
        <OTPInputSlot :index="0" />
        <OTPInputSlot :index="1" />
        <OTPInputSlot :index="2" />
      </OTPInputGroup>
      <OTPInputSeparator>
        <MinusIcon aria-hidden="true" />
      </OTPInputSeparator>
      <OTPInputGroup>
        <OTPInputSlot :index="3" />
        <OTPInputSlot :index="4" />
        <OTPInputSlot :index="5" />
      </OTPInputGroup>
    </OTPInput>
  </Field>
</template>

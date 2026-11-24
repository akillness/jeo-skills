<script setup lang="ts">
import { MinusIcon } from "@lucide/vue"
import {
  OTPInput,
  OTPInputGroup,
  OTPInputSeparator,
  OTPInputSlot,
} from "@ui-sdk/vue/otp-input"
</script>

<template>
  <OTPInput :max-length="6" aria-label="Verification code">
    <OTPInputGroup>
      <OTPInputSlot :index="0" />
      <OTPInputSlot :index="1" />
    </OTPInputGroup>
    <OTPInputSeparator>
      <MinusIcon aria-hidden="true" />
    </OTPInputSeparator>
    <OTPInputGroup>
      <OTPInputSlot :index="2" />
      <OTPInputSlot :index="3" />
    </OTPInputGroup>
    <OTPInputSeparator>
      <MinusIcon aria-hidden="true" />
    </OTPInputSeparator>
    <OTPInputGroup>
      <OTPInputSlot :index="4" />
      <OTPInputSlot :index="5" />
    </OTPInputGroup>
  </OTPInput>
</template>

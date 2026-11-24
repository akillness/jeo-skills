<script setup lang="ts">
import { Field, FieldError, FieldLabel } from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
import { ref } from "vue"

const invalid = ref(true)
</script>

<template>
  <Field :invalid="invalid">
    <FieldLabel>Verification code</FieldLabel>
    <OTPInput default-value="482913" @value-change="invalid = false">
      <OTPInputGroup>
        <OTPInputSlot
          v-for="index in [0, 1, 2, 3, 4, 5]"
          :key="index"
          :index="index"
        />
      </OTPInputGroup>
    </OTPInput>
    <FieldError>That code has expired. Request a new one.</FieldError>
  </Field>
</template>

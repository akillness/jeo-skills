<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { OTPInput, OTPInputGroup, OTPInputSlot } from "@ui-sdk/vue/otp-input"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const value = ref("")
</script>

<template>
  <Field>
    <FieldLabel>One-time password</FieldLabel>
    <OTPInput
      v-model:value="value"
      @value-change="
        (next, details) => log(`${next || 'Empty'} (${details.reason})`)
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

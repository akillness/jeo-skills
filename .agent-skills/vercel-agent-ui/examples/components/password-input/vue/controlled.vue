<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const visible = ref(false)

function onVisibleChange(next: boolean, details: { reason: string }) {
  log(`${next ? "Shown" : "Hidden"} (${details.reason})`)
}
</script>

<template>
  <Field name="password">
    <FieldLabel>Password</FieldLabel>
    <PasswordInput v-model:visible="visible" @visible-change="onVisibleChange">
      <PasswordInputControl />
      <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
        <EyeOffIcon v-if="state.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
  </Field>
</template>

<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
</script>

<template>
  <Field disabled name="password">
    <FieldLabel>Password</FieldLabel>
    <PasswordInput default-value="hunter22">
      <PasswordInputControl />
      <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
        <EyeOffIcon v-if="state.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
    <FieldDescription
      >Your administrator manages this password.</FieldDescription
    >
  </Field>
</template>

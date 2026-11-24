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
  <Field name="wifi-password">
    <FieldLabel>Wi-Fi password</FieldLabel>
    <PasswordInput
      default-visible
      default-value="maple-orbit-42"
      auto-complete="new-password"
    >
      <PasswordInputControl />
      <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
        <EyeOffIcon v-if="state.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
    <FieldDescription
      >Guests read it from here, so it starts shown.</FieldDescription
    >
  </Field>
</template>

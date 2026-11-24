<script setup lang="ts">
import { EyeIcon, EyeOffIcon, LockIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
</script>

<template>
  <Field name="password">
    <FieldLabel>Password</FieldLabel>
    <PasswordInput v-slot="{ state }">
      <PasswordInputControl />
      <span><LockIcon v-if="state.capsLock" aria-hidden="true" /></span>
      <PasswordInputToggle
        v-slot="{ state: toggle }"
        aria-label="Show password"
      >
        <EyeOffIcon v-if="toggle.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
    <p data-slot="caps-lock">Caps Lock is on.</p>
  </Field>
</template>

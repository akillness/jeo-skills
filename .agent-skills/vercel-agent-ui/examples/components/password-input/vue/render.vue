<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
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
    <PasswordInput>
      <PasswordInputControl />
      <PasswordInputToggle aria-label="Show password">
        <template #render="{ props, state }">
          <button v-bind="props">
            <EyeOffIcon v-if="state.visible" aria-hidden="true" />
            <EyeIcon v-else aria-hidden="true" />
          </button>
        </template>
      </PasswordInputToggle>
    </PasswordInput>
  </Field>
</template>

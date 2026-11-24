<script setup lang="ts">
import { CheckIcon, EyeIcon, EyeOffIcon, XIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
import { ref } from "vue"

const rules = [
  {
    label: "At least 8 characters",
    test: (password: string) => password.length >= 8,
  },
  { label: "A number", test: (password: string) => /\d/.test(password) },
  {
    label: "An uppercase and a lowercase letter",
    test: (password: string) =>
      /[a-z]/.test(password) && /[A-Z]/.test(password),
  },
]

const password = ref("")
</script>

<template>
  <Field name="new-password">
    <FieldLabel>Create a password</FieldLabel>
    <PasswordInput
      :value="password"
      auto-complete="new-password"
      @value-change="(value: string) => (password = value)"
    >
      <PasswordInputControl />
      <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
        <EyeOffIcon v-if="state.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
    <ul data-slot="stack" aria-label="Password requirements">
      <template v-for="rule in rules" :key="rule.label">
        <li v-if="rule.test(password)" data-slot="row">
          <CheckIcon aria-hidden="true" />
          <span data-slot="visually-hidden">Done:</span>
          {{ rule.label }}
        </li>
        <li v-else data-slot="row">
          <XIcon aria-hidden="true" />
          <span data-slot="visually-hidden">To do:</span>
          {{ rule.label }}
        </li>
      </template>
    </ul>
  </Field>
</template>

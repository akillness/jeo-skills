<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
import { computed, ref } from "vue"

const value = ref("")

const score = computed(
  () =>
    [
      value.value.length >= 8,
      value.value.length >= 12,
      /[a-z]/.test(value.value) && /[A-Z]/.test(value.value),
      /\d/.test(value.value) && /[^a-zA-Z\d]/.test(value.value),
    ].filter(Boolean).length
)
</script>

<template>
  <Field name="new-password">
    <FieldLabel>New password</FieldLabel>
    <PasswordInput v-model:value="value" auto-complete="new-password">
      <PasswordInputControl />
      <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
        <EyeOffIcon v-if="state.visible" aria-hidden="true" />
        <EyeIcon v-else aria-hidden="true" />
      </PasswordInputToggle>
    </PasswordInput>
    <div data-slot="strength" aria-hidden="true">
      <div
        v-for="level in [1, 2, 3, 4]"
        :key="level"
        :data-on="score >= level || undefined"
      />
    </div>
    <output data-slot="output">
      {{
        value
          ? `Strength: ${["Weak", "Weak", "Fair", "Good", "Strong"][score]} (${value.length} characters)`
          : "Type a password to rate it."
      }}
    </output>
  </Field>
</template>

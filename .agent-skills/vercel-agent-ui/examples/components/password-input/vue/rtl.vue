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
  <div dir="rtl">
    <Field name="password">
      <FieldLabel>كلمة المرور</FieldLabel>
      <PasswordInput>
        <PasswordInputControl />
        <PasswordInputToggle v-slot="{ state }" aria-label="إظهار كلمة المرور">
          <EyeOffIcon v-if="state.visible" aria-hidden="true" />
          <EyeIcon v-else aria-hidden="true" />
        </PasswordInputToggle>
      </PasswordInput>
      <FieldDescription>ثمانية أحرف على الأقل.</FieldDescription>
    </Field>
  </div>
</template>

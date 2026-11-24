<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import {
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  const data = new FormData(event.currentTarget as HTMLFormElement)
  const length = String(data.get("password")).length
  log(
    `Signed in as ${data.get("email")}, with a password of ${length} characters`
  )
}
</script>

<template>
  <div data-slot="stack">
    <form id="sign-in" data-slot="stack" @submit.prevent="onSubmit">
      <Field name="email">
        <FieldLabel>Email</FieldLabel>
        <Input type="email" required autocomplete="username" />
      </Field>
    </form>
    <Field>
      <FieldLabel>Password</FieldLabel>
      <PasswordInput name="password" form="sign-in" required>
        <PasswordInputControl />
        <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
          <EyeOffIcon v-if="state.visible" aria-hidden="true" />
          <EyeIcon v-else aria-hidden="true" />
        </PasswordInputToggle>
      </PasswordInput>
    </Field>
    <div data-slot="row">
      <button type="submit" form="sign-in" data-variant="solid">Sign In</button>
      <button type="reset" form="sign-in">Reset</button>
    </div>
  </div>
</template>

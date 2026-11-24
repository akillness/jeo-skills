<script setup lang="ts">
import { EyeIcon, EyeOffIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  createPasswordInputController,
  PasswordInput,
  PasswordInputControl,
  PasswordInputToggle,
} from "@ui-sdk/vue/password-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const password = createPasswordInputController()

function suggest() {
  password.setValue("plum-kettle-orbit-42")
  password.setVisible(true)
}

function read() {
  log(
    `${password.getValue().length} characters, ${password.isVisible() ? "shown" : "hidden"}`
  )
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <button type="button" @click="suggest">Suggest</button>
      <button type="button" @click="password.toggleVisible()">Toggle</button>
      <button type="button" @click="password.clear()">Clear</button>
      <button type="button" @click="read">Read</button>
      <button type="button" @click="password.focus()">Focus</button>
    </div>
    <Field name="new-password">
      <FieldLabel>New password</FieldLabel>
      <PasswordInput :controller="password" auto-complete="new-password">
        <PasswordInputControl />
        <PasswordInputToggle v-slot="{ state }" aria-label="Show password">
          <EyeOffIcon v-if="state.visible" aria-hidden="true" />
          <EyeIcon v-else aria-hidden="true" />
        </PasswordInputToggle>
      </PasswordInput>
    </Field>
  </div>
</template>

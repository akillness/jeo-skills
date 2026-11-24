<script setup lang="ts">
import { CheckIcon } from "@lucide/vue"
import { Checkbox, CheckboxIndicator } from "@ui-sdk/vue/checkbox"
import { Field, FieldDescription, FieldLabel } from "@ui-sdk/vue/field"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  const entries = [...new FormData(event.currentTarget as HTMLFormElement)].map(
    ([name, value]) => `${name}=${value}`
  )
  log(entries.length ? `Submitted ${entries.join("&")}` : "Submitted nothing")
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <Checkbox name="terms" value="yes" required>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      <div data-slot="stack">
        <FieldLabel>Accept terms and conditions</FieldLabel>
        <FieldDescription
          >You agree to our Terms of Service and Privacy
          Policy.</FieldDescription
        >
      </div>
    </Field>
    <Field>
      <Checkbox name="newsletter" value="weekly" default-checked>
        <CheckboxIndicator>
          <CheckIcon aria-hidden="true" />
        </CheckboxIndicator>
      </Checkbox>
      <div data-slot="stack">
        <FieldLabel>Send me the weekly newsletter</FieldLabel>
        <FieldDescription
          >Product news and tips, once a week. Unsubscribe
          anytime.</FieldDescription
        >
      </div>
    </Field>
    <div data-slot="row">
      <button type="submit">Create Account</button>
      <button type="reset">Reset</button>
    </div>
  </form>
</template>

<script setup lang="ts">
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function submit(event: Event) {
  log(
    `Subscribed ${new FormData(event.currentTarget as HTMLFormElement).get("email")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="submit">
    <Field name="email">
      <FieldLabel>Email</FieldLabel>
      <Input type="email" required placeholder="hollis@example.com" />
      <FieldDescription v-slot="{ state }">
        {{
          state.valid ? "Looks good." : "We'll send you a confirmation link."
        }}
      </FieldDescription>
      <FieldError match="valueMissing">Enter your email address.</FieldError>
      <FieldError match="typeMismatch"
        >Enter an email address like hollis@example.com.</FieldError
      >
    </Field>
    <Field name="website">
      <FieldLabel>Website</FieldLabel>
      <Input type="url" required placeholder="https://example.com" />
      <FieldError />
    </Field>
    <button type="submit" data-variant="solid">Subscribe</button>
  </form>
</template>

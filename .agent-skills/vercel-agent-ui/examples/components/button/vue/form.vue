<script setup lang="ts">
import { Button } from "@ui-sdk/vue/button"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Input } from "@ui-sdk/vue/input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  const email = String(
    new FormData(event.currentTarget as HTMLFormElement).get("email")
  )
  log(`Subscribed ${email}`)
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <FieldLabel>Email</FieldLabel>
      <Input name="email" type="email" defaultValue="ada@example.com" />
    </Field>
    <div data-slot="row">
      <Button type="submit">Subscribe</Button>
      <Button type="reset">Reset</Button>
    </div>
  </form>
</template>

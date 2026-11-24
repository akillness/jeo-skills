<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { Textarea, createInputController } from "@ui-sdk/vue/textarea"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
const message = createInputController()

function onSubmit(event: Event) {
  const data = new FormData(event.currentTarget as HTMLFormElement)
  log(`Sent “${data.get("message")}”`)
  message.clear()
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field name="message">
      <FieldLabel>Message</FieldLabel>
      <Textarea
        :controller="message"
        required
        placeholder="Write a reply to Hollis Grant…"
      />
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Send Message</button>
    </div>
  </form>
</template>

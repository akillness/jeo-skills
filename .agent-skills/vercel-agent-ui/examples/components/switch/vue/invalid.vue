<script setup lang="ts">
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@ui-sdk/vue/field"
import { Switch, SwitchThumb } from "@ui-sdk/vue/switch"
import { useLog } from "../../../shared/vue/log"

const log = useLog()

function onSubmit(event: Event) {
  log(
    `Submitted two-factor=${new FormData(event.currentTarget as HTMLFormElement).get("two-factor")}`
  )
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <Field>
      <div data-slot="row">
        <div data-slot="stack">
          <FieldLabel>Two-factor authentication</FieldLabel>
          <FieldDescription
            >Required for admins of this workspace.</FieldDescription
          >
        </div>
        <Switch name="two-factor" required>
          <SwitchThumb />
        </Switch>
      </div>
      <FieldError match="valueMissing">Turn this on to continue.</FieldError>
    </Field>
    <div data-slot="row">
      <button type="submit" data-variant="solid">Continue</button>
    </div>
  </form>
</template>

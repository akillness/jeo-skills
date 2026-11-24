<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import { toLabel, TokenInput, TokenInputEditor } from "@ui-sdk/vue/token-input"
import { useLog } from "../../../shared/vue/log"

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <TokenInput
      submit-shortcut="mod+enter"
      @submit="(value) => log(`Sent ${toLabel(value)}`)"
    >
      <TokenInputEditor placeholder="Write a message…" />
    </TokenInput>
  </Field>
</template>

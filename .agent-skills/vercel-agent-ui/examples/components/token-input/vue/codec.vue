<script setup lang="ts">
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  fromText,
  toText,
  TokenInput,
  TokenInputEditor,
  type TokenCodec,
} from "@ui-sdk/vue/token-input"
import { useLog } from "../../../shared/vue/log"

const chat: TokenCodec = {
  format: (token) => `<@${token.value}>`,
  parse: (text) =>
    text.split(/(<@[\w.-]+>)/).map((part) => {
      const id = /^<@([\w.-]+)>$/.exec(part)?.[1]
      return id ? { type: "mention", value: id, label: `@${id}` } : part
    }),
}

const draft = fromText("Ping <@hollis> and <@ines> about the launch", chat)

const log = useLog()
</script>

<template>
  <Field>
    <FieldLabel>Message</FieldLabel>
    <TokenInput
      :codec="chat"
      copy="label"
      :default-value="draft"
      @value-change="(value) => log(toText(value, chat))"
    >
      <TokenInputEditor />
    </TokenInput>
  </Field>
</template>

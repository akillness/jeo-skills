<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerMenuSelectDetails,
  TriggerMenu,
  TriggerMenuHint,
  TriggerMenuInput,
} from "@ui-sdk/vue/trigger-menu"
import { useLog } from "../../../shared/vue/log"

const commands = [
  {
    value: "status",
    label: "status",
    arguments: [
      {
        name: "status",
        hint: "<status>",
        required: true,
        items: ["available", "busy", "away"],
      },
      {
        name: "until",
        hint: "[until]",
        items: ["30m", "1h", "4h", "today"],
        allowCustomValue: false,
      },
    ],
  },
  {
    value: "search",
    label: "search",
    arguments: [{ name: "query", hint: "<query>", required: true }],
  },
  { value: "away", label: "away", after: "submit" as const },
  { value: "clear", label: "clear" },
]

const log = useLog()

function onSubmit(event: Event) {
  log(
    `Sent ${new FormData(event.currentTarget as HTMLFormElement).get("message")}`
  )
}

function onSelect(value: string, details: TriggerMenuSelectDetails<string>) {
  log(["Chose", `/${value}`, ...Object.values(details.arguments)].join(" "))
}
</script>

<template>
  <form data-slot="stack" @submit.prevent="onSubmit">
    <TriggerMenu
      :triggers="[
        { char: '/', boundary: 'start', type: 'command', items: commands },
      ]"
      @select="onSelect"
    >
      <Field name="message">
        <FieldLabel>Message</FieldLabel>
        <FieldControl>
          <template #render="{ props }">
            <TriggerMenuInput
              v-bind="props"
              placeholder="Type / for commands…"
            />
          </template>
        </FieldControl>
      </Field>
      <TriggerMenuHint />
    </TriggerMenu>
  </form>
</template>

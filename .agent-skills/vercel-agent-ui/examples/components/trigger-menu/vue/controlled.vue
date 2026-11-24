<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import { TriggerMenu, TriggerMenuInput } from "@ui-sdk/vue/trigger-menu"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

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
    ],
  },
]

const log = useLog()
const open = ref(false)
</script>

<template>
  <TriggerMenu
    v-model:open="open"
    :triggers="[
      { char: '@', items: people },
      { char: '/', boundary: 'start', items: commands },
    ]"
    shortcut="ctrl+j"
    @open-change="
      (next, details) =>
        log(`${next ? 'Opening' : 'Closing'} (${details.reason})`)
    "
    @open-change-complete="(next) => log(next ? 'Open' : 'Closed')"
    @query-change="
      (query, details) =>
        log(
          `Query “${query}”${details.argument ? ` for ${details.argument}` : ''}`
        )
    "
  >
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput v-bind="props" placeholder="Type @ or /…" />
        </template>
      </FieldControl>
    </Field>
  </TriggerMenu>
</template>

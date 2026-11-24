<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerDefinition,
  TriggerMenu,
  TriggerMenuInput,
} from "@ui-sdk/vue/trigger-menu"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const commands = ["away", "remind", "search", "status"]

const channels = [
  "announcements",
  "design",
  "design-reviews",
  "engineering",
  "general",
  "launches",
  "support",
]

function searchChannels(query: string, { signal }: { signal: AbortSignal }) {
  return new Promise<string[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        resolve(
          channels.filter((channel) => channel.includes(query.toLowerCase()))
        ),
      400
    )
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}

const triggers: TriggerDefinition[] = [
  { char: "@", items: people },
  { char: "/", boundary: "start", items: commands },
  { char: "#", items: searchChannels },
]
</script>

<template>
  <TriggerMenu :triggers="triggers">
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput v-bind="props" placeholder="Type @, / or #…" />
        </template>
      </FieldControl>
    </Field>
  </TriggerMenu>
</template>

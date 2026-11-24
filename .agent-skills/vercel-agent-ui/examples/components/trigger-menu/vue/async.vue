<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuEmpty,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
  TriggerMenuStatus,
} from "@ui-sdk/vue/trigger-menu"

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
  return new Promise<{ value: string; label: string }[]>((resolve, reject) => {
    const timer = setTimeout(
      () =>
        resolve(
          channels
            .filter((channel) => channel.includes(query.toLowerCase()))
            .map((channel) => ({ value: channel, label: channel }))
        ),
      600
    )
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    })
  })
}
</script>

<template>
  <TriggerMenu
    :triggers="[{ char: '#', type: 'channel', items: searchChannels }]"
  >
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput
            v-bind="props"
            placeholder="Type # to link a channel…"
          />
        </template>
      </FieldControl>
    </Field>
    <TriggerMenuContent>
      <TriggerMenuStatus v-slot="{ state }">
        {{
          state.loading
            ? "Loading channels…"
            : state.count
              ? `${state.count} ${state.count === 1 ? "channel" : "channels"}`
              : ""
        }}
      </TriggerMenuStatus>
      <TriggerMenuEmpty v-slot="{ state }">
        <template v-if="state.empty && !state.loading"
          >No channels match “{{ state.query }}”</template
        >
      </TriggerMenuEmpty>
      <TriggerMenuList v-slot="{ state }">
        <TriggerMenuItem
          v-for="item in state.items as TriggerMenuDataItem[]"
          :key="item.value"
          :value="item.value"
          :label="item.label"
        >
          {{ item.label }}
        </TriggerMenuItem>
      </TriggerMenuList>
    </TriggerMenuContent>
  </TriggerMenu>
</template>

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

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]
</script>

<template>
  <TriggerMenu :triggers="[{ char: '@', type: 'mention', items: people }]">
    <Field>
      <FieldLabel>Message</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput
            v-bind="props"
            placeholder="Type @ to mention someone…"
          />
        </template>
      </FieldControl>
    </Field>
    <div data-slot="visually-hidden">
      <TriggerMenuStatus />
    </div>
    <TriggerMenuContent>
      <TriggerMenuEmpty>No one found</TriggerMenuEmpty>
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

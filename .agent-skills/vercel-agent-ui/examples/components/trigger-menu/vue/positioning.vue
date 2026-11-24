<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuInput,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/vue/trigger-menu"
import { useTemplateRef } from "vue"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const field = useTemplateRef<{ $el: HTMLDivElement }>("field")
</script>

<template>
  <TriggerMenu :triggers="[{ char: '@', items: people }]">
    <Field ref="field">
      <FieldLabel>Comment</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput
            v-bind="props"
            placeholder="Type @ to mention someone…"
          />
        </template>
      </FieldControl>
    </Field>
    <TriggerMenuContent
      side="top"
      align="start"
      :side-offset="8"
      :align-offset="-5"
      :collision-padding="16"
      :anchor="field?.$el"
      :container="field?.$el"
      keep-mounted
    >
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

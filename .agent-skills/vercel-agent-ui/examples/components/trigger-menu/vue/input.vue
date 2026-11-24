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

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]
</script>

<template>
  <TriggerMenu
    :triggers="[{ char: '@', items: people }]"
    :auto-highlight="false"
    :loop="false"
  >
    <Field>
      <FieldLabel>Task</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <TriggerMenuInput
            v-bind="props"
            placeholder="Type @ to assign someone…"
          >
            <template #render="{ props: inputProps }">
              <input v-bind="inputProps" />
            </template>
          </TriggerMenuInput>
        </template>
      </FieldControl>
    </Field>
    <TriggerMenuContent>
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

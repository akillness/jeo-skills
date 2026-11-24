<script setup lang="ts">
import { Field, FieldControl, FieldLabel } from "@ui-sdk/vue/field"
import {
  type TextEditorAdapter,
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
  textFieldAdapter,
} from "@ui-sdk/vue/trigger-menu"
import { type Directive, shallowRef } from "vue"

const people = [
  { value: "hollis", label: "Hollis Grant" },
  { value: "ines", label: "Inès Moreau" },
  { value: "kofi", label: "Kofi Mensah" },
  { value: "wren", label: "Wren Takahashi" },
  { value: "tomasz", label: "Tomasz Wójcik" },
]

const editor = shallowRef<TextEditorAdapter>()
const vEditor: Directive<HTMLTextAreaElement> = {
  mounted: (field) => (editor.value = textFieldAdapter(field)),
}
</script>

<template>
  <TriggerMenu :editor="editor" :triggers="[{ char: '@', items: people }]">
    <Field>
      <FieldLabel>Notes</FieldLabel>
      <FieldControl>
        <template #render="{ props }">
          <textarea
            v-bind="props"
            v-editor
            placeholder="Type @ to mention someone…"
          />
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

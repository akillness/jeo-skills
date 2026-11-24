<script setup lang="ts">
import { XIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  TokenInputTokenRemove,
} from "@ui-sdk/vue/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
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
  <Field>
    <FieldLabel>Message</FieldLabel>
    <TokenInput>
      <TokenInputEditor placeholder="Type @ to mention someone…" />
      <TriggerMenu :triggers="[{ char: '@', type: 'mention', items: people }]">
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
      <template #token="{ token }">
        <TokenInputToken>
          {{ token.label }}
          <TokenInputTokenRemove>
            <XIcon aria-hidden="true" />
          </TokenInputTokenRemove>
        </TokenInputToken>
      </template>
    </TokenInput>
  </Field>
</template>

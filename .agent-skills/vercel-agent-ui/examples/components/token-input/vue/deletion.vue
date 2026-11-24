<script setup lang="ts">
import { CheckIcon, ChevronDownIcon, FileIcon } from "@lucide/vue"
import { Field, FieldLabel } from "@ui-sdk/vue/field"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectItemIndicator,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@ui-sdk/vue/select"
import {
  TokenInput,
  TokenInputEditor,
  TokenInputToken,
  type TokenDeletion,
  type TokenInputValue,
  type TokenInputValueChangeDetails,
} from "@ui-sdk/vue/token-input"
import {
  type TriggerMenuDataItem,
  TriggerMenu,
  TriggerMenuContent,
  TriggerMenuItem,
  TriggerMenuList,
} from "@ui-sdk/vue/trigger-menu"
import { ref } from "vue"
import { useLog } from "../../../shared/vue/log"

const modes = [
  { value: "whole", label: "Whole" },
  { value: "select", label: "Select" },
  { value: "revert", label: "Revert" },
]

const files = [
  { value: "src/app.tsx", label: "app.tsx", keywords: ["src"] },
  { value: "src/routes.ts", label: "routes.ts", keywords: ["src"] },
  { value: "src/styles.css", label: "styles.css", keywords: ["src"] },
  { value: "README.md", label: "README.md" },
  { value: "package.json", label: "package.json" },
]

const draft: TokenInputValue = [
  "Explain ",
  {
    type: "file",
    value: "src/routes.ts",
    label: "routes.ts",
    data: { trigger: "@" },
  },
  " in two sentences.",
]

const log = useLog()
const deletion = ref<TokenDeletion>("whole")

function onValueChange(
  value: TokenInputValue,
  details: TokenInputValueChangeDetails
) {
  for (const token of details.removed) {
    log(`Removed ${token.label} (${deletion.value})`)
  }
}
</script>

<template>
  <div data-slot="stack">
    <div data-slot="controls">
      <Select
        :items="modes"
        :value="deletion"
        @value-change="(next) => next && (deletion = next as TokenDeletion)"
      >
        <SelectLabel>Backspace</SelectLabel>
        <SelectTrigger>
          <SelectValue />
          <ChevronDownIcon aria-hidden="true" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="mode in modes"
            :key="mode.value"
            :value="mode.value"
          >
            {{ mode.label }}
            <SelectItemIndicator>
              <CheckIcon aria-hidden="true" />
            </SelectItemIndicator>
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
    <Field>
      <FieldLabel>Prompt</FieldLabel>
      <TokenInput
        :token-deletion="deletion"
        :default-value="draft"
        @value-change="onValueChange"
      >
        <TokenInputEditor />
        <TriggerMenu :triggers="[{ char: '@', type: 'file', items: files }]">
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
            <FileIcon aria-hidden="true" />
            {{ token.label }}
          </TokenInputToken>
        </template>
      </TokenInput>
    </Field>
  </div>
</template>
